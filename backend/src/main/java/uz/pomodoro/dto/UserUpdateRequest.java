package uz.pomodoro.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UserUpdateRequest(
    @Size(max = 255)
    String name,

    @Size(max = 255)
    String email,

    String avatarUrl
) {
}
