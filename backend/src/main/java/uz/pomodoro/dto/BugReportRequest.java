package uz.pomodoro.dto;

public record BugReportRequest(
    String category,
    String description,
    String pageUrl,
    String userAgent
) {}
