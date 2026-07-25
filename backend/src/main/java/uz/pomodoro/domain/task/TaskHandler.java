package uz.pomodoro.domain.task;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import reactor.core.publisher.Mono;
import uz.pomodoro.dto.BatchTaskSyncRequest;
import uz.pomodoro.dto.TaskDto;
import uz.pomodoro.dto.TaskRequest;

import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class TaskHandler {

    private final TaskService taskService;
    private final TaskCacheService taskCacheService;

    public Mono<ServerResponse> getTasks(ServerRequest request) {
        return currentUserId().flatMap(userId ->
            taskCacheService.getCachedTasks(userId)
                .switchIfEmpty(
                    taskService.getUserTasks(userId)
                        .map(this::toDto)
                        .collectList()
                        .flatMap(tasks -> taskCacheService.cacheTasks(userId, tasks).thenReturn(tasks))
                )
                .flatMap(tasks -> {
                    String etag = computeEtag(tasks);
                    String ifNoneMatch = request.headers().firstHeader("If-None-Match");
                    if (ifNoneMatch != null && ifNoneMatch.equals(etag)) {
                        return ServerResponse.status(HttpStatus.NOT_MODIFIED)
                            .eTag(etag)
                            .build();
                    }
                    return ServerResponse.ok()
                        .contentType(MediaType.APPLICATION_JSON)
                        .eTag(etag)
                        .bodyValue(tasks);
                })
        );
    }

    public Mono<ServerResponse> createTask(ServerRequest request) {
        return Mono.zip(currentUserId(), request.bodyToMono(TaskRequest.class))
            .flatMap(tuple -> taskService.createTask(tuple.getT1(), tuple.getT2())
                .flatMap(created -> taskCacheService.evictTasks(tuple.getT1()).thenReturn(created))
            )
            .map(this::toDto)
            .flatMap(task -> ServerResponse.status(HttpStatus.CREATED)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(task)
            );
    }

    public Mono<ServerResponse> updateTask(ServerRequest request) {
        UUID taskId = UUID.fromString(request.pathVariable("id"));

        return Mono.zip(currentUserId(), request.bodyToMono(TaskRequest.class))
            .flatMap(tuple -> taskService.updateTask(tuple.getT1(), taskId, tuple.getT2())
                .flatMap(updated -> taskCacheService.evictTasks(tuple.getT1()).thenReturn(updated))
            )
            .map(this::toDto)
            .flatMap(task -> ServerResponse.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(task)
            );
    }

    public Mono<ServerResponse> deleteTask(ServerRequest request) {
        UUID taskId = UUID.fromString(request.pathVariable("id"));

        return currentUserId()
            .flatMap(userId -> taskService.deleteTask(userId, taskId)
                .then(taskCacheService.evictTasks(userId))
            )
            .then(ServerResponse.noContent().build());
    }

    public Mono<ServerResponse> syncTasks(ServerRequest request) {
        Mono<BatchTaskSyncRequest> syncRequestMono = request.bodyToMono(BatchTaskSyncRequest.class)
            .defaultIfEmpty(new BatchTaskSyncRequest(null));

        return Mono.zip(currentUserId(), syncRequestMono)
            .flatMap(tuple -> taskService.syncTasks(tuple.getT1(), tuple.getT2().tasks())
                .map(this::toDto)
                .collectList()
                .flatMap(tasks -> taskCacheService.cacheTasks(tuple.getT1(), tasks).thenReturn(tasks))
            )
            .flatMap(tasks -> {
                String etag = computeEtag(tasks);
                return ServerResponse.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .eTag(etag)
                    .bodyValue(tasks);
            });
    }

    public Mono<ServerResponse> clearCompleted(ServerRequest request) {
        return currentUserId()
            .flatMap(userId -> taskService.deleteCompletedTasks(userId)
                .then(taskCacheService.evictTasks(userId))
            )
            .then(ServerResponse.noContent().build());
    }

    public Mono<ServerResponse> clearAll(ServerRequest request) {
        return currentUserId()
            .flatMap(userId -> taskService.deleteAllTasks(userId)
                .then(taskCacheService.evictTasks(userId))
            )
            .then(ServerResponse.noContent().build());
    }

    private Mono<UUID> currentUserId() {
        return ReactiveSecurityContextHolder.getContext()
            .map(context -> context.getAuthentication().getPrincipal())
            .cast(UUID.class);
    }

    private TaskDto toDto(Task task) {
        return new TaskDto(
            task.getId(),
            task.getText(),
            task.getDone(),
            task.getPosition(),
            task.getCreatedAt(),
            task.getUpdatedAt()
        );
    }

    private String computeEtag(List<TaskDto> tasks) {
        if (tasks == null || tasks.isEmpty()) {
            return "\"empty\"";
        }
        try {
            StringBuilder sb = new StringBuilder();
            for (TaskDto t : tasks) {
                sb.append(t.id()).append(':').append(t.text()).append(':').append(t.done()).append(':').append(t.position()).append(';');
            }
            MessageDigest digest = MessageDigest.getInstance("MD5");
            byte[] hash = digest.digest(sb.toString().getBytes());
            return "\"" + HexFormat.of().formatHex(hash) + "\"";
        } catch (Exception e) {
            return "\"" + tasks.hashCode() + "\"";
        }
    }
}
