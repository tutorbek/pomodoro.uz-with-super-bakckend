package uz.pomodoro.dto;

import java.time.LocalDateTime;
import java.util.UUID;

public record TaskDto(
    UUID id,
    String text,
    Boolean done,
    Integer position,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {
}
