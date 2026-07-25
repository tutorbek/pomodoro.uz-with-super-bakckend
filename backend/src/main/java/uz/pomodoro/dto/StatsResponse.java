package uz.pomodoro.dto;

import java.time.LocalDate;
import java.util.List;

public record StatsResponse(
    int totalSessions,
    int completedSessions,
    int totalMinutes,
    double completionRate,
    int currentStreak,
    int bestStreak,
    List<DailyEntry> entries,
    List<TaskBreakdownEntry> taskBreakdown
) {

    public record DailyEntry(
        LocalDate date,
        int count,
        int minutes
    ) {
    }

    public record TaskBreakdownEntry(
        String label,
        int minutes,
        int count,
        double percentage
    ) {
    }
}

