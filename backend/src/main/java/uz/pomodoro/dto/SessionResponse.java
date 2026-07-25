package uz.pomodoro.dto;

import java.time.LocalDateTime;
import java.util.UUID;

public record SessionResponse(
    UUID id,
    Integer duration,
    String label,
    UUID taskId,
    LocalDateTime startedAt,
    LocalDateTime endedAt,
    Boolean completed
) {
}
