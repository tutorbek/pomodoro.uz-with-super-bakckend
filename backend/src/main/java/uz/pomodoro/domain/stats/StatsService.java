package uz.pomodoro.domain.stats;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import uz.pomodoro.domain.session.PomodoroSession;
import uz.pomodoro.domain.session.SessionRepository;
import uz.pomodoro.dto.FullStatsResponse;
import uz.pomodoro.dto.StatsResponse;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class StatsService {

    private static final ZoneId DEFAULT_ZONE = ZoneId.of("Asia/Tashkent");

    private final SessionRepository sessionRepository;
    private final DailyStatsRepository dailyStatsRepository;

    private LocalDate getToday() {
        return LocalDate.now(DEFAULT_ZONE);
    }

    public Mono<StatsResponse> getDaily(UUID userId) {
        return getDaily(userId, 0);
    }

    public Mono<StatsResponse> getDaily(UUID userId, int offset) {
        LocalDate target = getToday().plusDays(offset);
        return buildStats(userId, target, target);
    }

    public Mono<StatsResponse> getWeekly(UUID userId) {
        return getWeekly(userId, 0);
    }

    public Mono<StatsResponse> getWeekly(UUID userId, int offset) {
        LocalDate target = getToday().plusWeeks(offset);
        LocalDate startOfWeek = target.with(DayOfWeek.MONDAY);
        LocalDate endOfWeek = target.with(DayOfWeek.SUNDAY);
        return buildStats(userId, startOfWeek, endOfWeek);
    }

    public Mono<StatsResponse> getMonthly(UUID userId) {
        return getMonthly(userId, 0);
    }

    public Mono<StatsResponse> getMonthly(UUID userId, int offset) {
        LocalDate target = getToday().plusMonths(offset);
        LocalDate startOfMonth = target.withDayOfMonth(1);
        LocalDate endOfMonth = target.withDayOfMonth(target.lengthOfMonth());
        return buildStats(userId, startOfMonth, endOfMonth);
    }

    public Mono<StatsResponse> getYearly(UUID userId) {
        return getYearly(userId, 0);
    }

    public Mono<StatsResponse> getYearly(UUID userId, int offset) {
        LocalDate target = getToday().plusYears(offset);
        LocalDate startOfYear = target.withDayOfYear(1);
        LocalDate endOfYear = target.withDayOfYear(target.lengthOfYear());
        return buildStats(userId, startOfYear, endOfYear);
    }

    public Mono<Map<String, Object>> getSummary(UUID userId) {
        return Mono.zip(
            sessionRepository.findByUserIdOrderByCreatedAtDesc(userId).collectList(),
            calculateStreaks(userId)
        ).map(tuple -> {
            List<PomodoroSession> sessions = tuple.getT1();
            List<PomodoroSession> completedSessions = completedSessions(sessions);
            StreakInfo streakInfo = tuple.getT2();

            Map<String, Object> summary = new HashMap<>();
            summary.put("totalSessions", sessions.size());
            summary.put("totalMinutes", totalMinutes(completedSessions));
            summary.put("completedSessions", completedSessions.size());
            summary.put("streak", streakInfo.currentStreak());
            summary.put("streakCount", streakInfo.currentStreak());
            summary.put("bestStreak", streakInfo.bestStreak());

            return summary;
        });
    }

    public Mono<FullStatsResponse> getFullStats(UUID userId) {
        return Mono.zip(
            getSummary(userId),
            getDaily(userId),
            getWeekly(userId),
            getMonthly(userId),
            getYearly(userId),
            sessionRepository.findByUserIdOrderByCreatedAtDesc(userId).collectList()
        ).map(tuple -> new FullStatsResponse(
            tuple.getT1(),
            tuple.getT2(),
            tuple.getT3(),
            tuple.getT4(),
            tuple.getT5(),
            tuple.getT6()
        ));
    }

    public Mono<StatsResponse> getSummaryStats(UUID userId) {
        return Mono.zip(
            sessionRepository.findByUserIdOrderByCreatedAtDesc(userId).collectList(),
            calculateStreaks(userId)
        ).map(tuple -> {
            List<PomodoroSession> sessions = tuple.getT1();
            StreakInfo streakInfo = tuple.getT2();
            LocalDate fromDate = sessions.stream()
                .map(s -> s.getStartedAt() != null ? s.getStartedAt().toLocalDate() : (s.getCreatedAt() != null ? s.getCreatedAt().toLocalDate() : getToday()))
                .min(Comparator.naturalOrder())
                .orElse(getToday());
            return toStatsResponse(sessions, fromDate, getToday(), streakInfo.currentStreak(), streakInfo.bestStreak());
        });
    }

    public Mono<Long> countTotalSessions() {
        return sessionRepository.count();
    }

    public Mono<Void> incrementDailyStats(UUID userId, int minutes) {
        LocalDate today = getToday();

        return dailyStatsRepository.findByUserIdAndDate(userId, today)
            .defaultIfEmpty(DailyStats.builder()
                .userId(userId)
                .date(today)
                .totalCount(0)
                .totalMinutes(0)
                .build()
            )
            .flatMap(stats -> {
                stats.setTotalCount(stats.getTotalCount() + 1);
                stats.setTotalMinutes(stats.getTotalMinutes() + minutes);
                return dailyStatsRepository.save(stats);
            })
            .onErrorResume(e -> Mono.empty())
            .then();
    }

    private Mono<StatsResponse> buildStats(UUID userId, LocalDate fromDate, LocalDate toDate) {
        LocalDateTime from = fromDate.atStartOfDay();
        LocalDateTime toExclusive = toDate.plusDays(1).atStartOfDay();

        return Mono.zip(
            sessionRepository.findByUserBetween(userId, from, toExclusive).collectList(),
            calculateStreaks(userId)
        ).map(tuple -> {
            List<PomodoroSession> rangeSessions = tuple.getT1();
            StreakInfo streakInfo = tuple.getT2();

            return toStatsResponse(rangeSessions, fromDate, toDate, streakInfo.currentStreak(), streakInfo.bestStreak());
        });
    }

    private StatsResponse toStatsResponse(List<PomodoroSession> sessions, LocalDate fromDate, LocalDate toDate, int currentStreak, int bestStreak) {
        List<PomodoroSession> completedSessions = completedSessions(sessions);
        Map<LocalDate, List<PomodoroSession>> completedByDate = completedSessions.stream()
            .collect(Collectors.groupingBy(session -> {
                if (session.getStartedAt() != null) return session.getStartedAt().toLocalDate();
                if (session.getCreatedAt() != null) return session.getCreatedAt().toLocalDate();
                return getToday();
            }));

        List<StatsResponse.DailyEntry> entries = new ArrayList<>();
        for (LocalDate date = fromDate; !date.isAfter(toDate); date = date.plusDays(1)) {
            List<PomodoroSession> daySessions = completedByDate.getOrDefault(date, List.of());
            entries.add(new StatsResponse.DailyEntry(
                date,
                daySessions.size(),
                totalMinutes(daySessions)
            ));
        }

        int totalSessions = sessions.size();
        int completedCount = completedSessions.size();
        int minutes = totalMinutes(completedSessions);
        double completionRate = totalSessions == 0 ? 0 : (double) completedCount / totalSessions * 100;

        List<StatsResponse.TaskBreakdownEntry> taskBreakdown = buildTaskBreakdown(completedSessions, minutes);

        return new StatsResponse(
            totalSessions,
            completedCount,
            minutes,
            completionRate,
            currentStreak,
            bestStreak,
            entries,
            taskBreakdown
        );
    }

    private List<StatsResponse.TaskBreakdownEntry> buildTaskBreakdown(List<PomodoroSession> completedSessions, int totalMinutes) {
        if (completedSessions.isEmpty() || totalMinutes == 0) {
            return List.of();
        }

        Map<String, List<PomodoroSession>> groupedByLabel = completedSessions.stream()
            .collect(Collectors.groupingBy(s -> (s.getLabel() == null || s.getLabel().isBlank()) ? "General Focus" : s.getLabel().trim()));

        return groupedByLabel.entrySet().stream()
            .map(entry -> {
                String label = entry.getKey();
                List<PomodoroSession> labelSessions = entry.getValue();
                int minutes = totalMinutes(labelSessions);
                int count = labelSessions.size();
                double percentage = (double) minutes / totalMinutes * 100;
                return new StatsResponse.TaskBreakdownEntry(label, minutes, count, Math.round(percentage * 10.0) / 10.0);
            })
            .sorted(Comparator.comparingInt(StatsResponse.TaskBreakdownEntry::minutes).reversed())
            .toList();
    }

    private record StreakInfo(int currentStreak, int bestStreak) {}

    private Mono<StreakInfo> calculateStreaks(UUID userId) {
        return sessionRepository.findByUserIdOrderByCreatedAtDesc(userId)
            .filter(session -> Boolean.TRUE.equals(session.getCompleted()))
            .map(session -> session.getStartedAt() != null ? session.getStartedAt().toLocalDate() : session.getCreatedAt().toLocalDate())
            .sort(Comparator.reverseOrder())
            .collectList()
            .map(this::computeStreakInfo);
    }

    private StreakInfo computeStreakInfo(List<LocalDate> dates) {
        if (dates.isEmpty()) {
            return new StreakInfo(0, 0);
        }

        List<LocalDate> sortedDistinctDates = dates.stream()
            .distinct()
            .sorted(Comparator.reverseOrder())
            .toList();

        LocalDate today = getToday();
        int currentStreak = 0;
        LocalDate expected = today;

        if (!sortedDistinctDates.contains(today) && sortedDistinctDates.contains(today.minusDays(1))) {
            expected = today.minusDays(1);
        }

        for (LocalDate date : sortedDistinctDates) {
            if (date.equals(expected)) {
                currentStreak++;
                expected = expected.minusDays(1);
            } else if (date.isBefore(expected)) {
                break;
            }
        }

        // Calculate best (longest) streak across all history
        int bestStreak = 0;
        int tempStreak = 0;
        LocalDate prev = null;

        // Sort ascending for best streak tracking
        List<LocalDate> ascDates = sortedDistinctDates.stream()
            .sorted()
            .toList();

        for (LocalDate date : ascDates) {
            if (prev == null || date.equals(prev.plusDays(1))) {
                tempStreak++;
            } else {
                tempStreak = 1;
            }
            if (tempStreak > bestStreak) {
                bestStreak = tempStreak;
            }
            prev = date;
        }

        return new StreakInfo(currentStreak, bestStreak);
    }

    private boolean isInRange(PomodoroSession session, LocalDateTime from, LocalDateTime toExclusive) {
        LocalDateTime startedAt = session.getStartedAt();
        return startedAt != null && !startedAt.isBefore(from) && startedAt.isBefore(toExclusive);
    }

    private List<PomodoroSession> completedSessions(List<PomodoroSession> sessions) {
        return sessions.stream()
            .filter(session -> Boolean.TRUE.equals(session.getCompleted()))
            .toList();
    }

    private int totalMinutes(List<PomodoroSession> sessions) {
        return sessions.stream()
            .map(PomodoroSession::getDuration)
            .filter(duration -> duration != null)
            .mapToInt(Integer::intValue)
            .sum();
    }
}
