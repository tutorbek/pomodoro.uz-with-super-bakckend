package uz.pomodoro.dto;

import java.util.UUID;

public record TaskRequest(
    UUID id,
    String text,
    Boolean done,
    Integer position
) {
}
