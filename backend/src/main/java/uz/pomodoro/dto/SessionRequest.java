package uz.pomodoro.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.util.UUID;

public record SessionRequest(
    @Min(1)
    @Max(90)
    Integer duration,

    String label,

    UUID taskId
) {
}
