package uz.pomodoro.dto;

import java.util.List;

public record BatchTaskSyncRequest(
    List<TaskRequest> tasks
) {
}
