package uz.pomodoro.scheduler;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import uz.pomodoro.domain.session.PomodoroSession;
import uz.pomodoro.domain.session.SessionRepository;
import uz.pomodoro.domain.stats.DailyStatsRepository;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class StatsScheduler {

    private final SessionRepository sessionRepository;
    private final DailyStatsRepository dailyStatsRepository;

    @Scheduled(cron = "0 0 0 * * *", zone = "Asia/Tashkent")
    public void computeDailyStats() {
        log.info("Daily stats computation started");

        LocalDate yesterday = LocalDate.now().minusDays(1);
        LocalDateTime from = yesterday.atStartOfDay();
        LocalDateTime to = yesterday.atTime(LocalTime.MAX);

        sessionRepository.findAllCompletedBetween(from, to)
            .groupBy(PomodoroSession::getUserId)
            .flatMap(group -> group.collectList()
                .flatMap(sessions -> {
                    UUID userId = sessions.get(0).getUserId();
                    int totalCount = sessions.size();
                    int totalMinutes = sessions.stream()
                        .map(PomodoroSession::getDuration)
                        .filter(duration -> duration != null)
                        .mapToInt(Integer::intValue)
                        .sum();

                    return dailyStatsRepository.upsert(userId, yesterday, totalCount, totalMinutes);
                })
            )
            .doOnComplete(() -> log.info("Daily stats computation finished"))
            .doOnError(error -> log.error("Daily stats computation failed", error))
            .subscribe();
    }

    @Scheduled(cron = "0 0 2 * * *", zone = "Asia/Tashkent")
    public void cleanOldSessions() {
        log.info("Old session cleanup is scheduled for a later implementation");
    }
}
