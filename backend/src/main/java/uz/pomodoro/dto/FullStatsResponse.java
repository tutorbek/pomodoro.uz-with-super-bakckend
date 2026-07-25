package uz.pomodoro.dto;

import uz.pomodoro.domain.session.PomodoroSession;
import java.util.List;
import java.util.Map;

public record FullStatsResponse(
    Map<String, Object> summary,
    StatsResponse daily,
    StatsResponse weekly,
    StatsResponse monthly,
    StatsResponse yearly,
    List<PomodoroSession> sessions
) {}
