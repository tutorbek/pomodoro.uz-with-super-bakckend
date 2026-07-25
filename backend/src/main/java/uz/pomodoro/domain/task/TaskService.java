package uz.pomodoro.domain.task;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import uz.pomodoro.dto.TaskRequest;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class TaskService {

    private final TaskRepository taskRepository;

    public Flux<Task> getUserTasks(UUID userId) {
        return taskRepository.findByUserIdOrderByPositionAsc(userId);
    }

    public Mono<Task> createTask(UUID userId, TaskRequest request) {
        LocalDateTime now = LocalDateTime.now();
        Task task = Task.builder()
            .userId(userId)
            .text(request.text() != null ? request.text() : "")
            .done(request.done() != null ? request.done() : false)
            .position(request.position() != null ? request.position() : 0)
            .createdAt(now)
            .updatedAt(now)
            .build();

        return taskRepository.save(task);
    }

    public Mono<Task> updateTask(UUID userId, UUID taskId, TaskRequest request) {
        return taskRepository.findByIdAndUserId(taskId, userId)
            .flatMap(existingTask -> {
                if (request.text() != null) {
                    existingTask.setText(request.text());
                }
                if (request.done() != null) {
                    existingTask.setDone(request.done());
                }
                if (request.position() != null) {
                    existingTask.setPosition(request.position());
                }
                existingTask.setUpdatedAt(LocalDateTime.now());
                return taskRepository.save(existingTask);
            });
    }

    public Mono<Void> deleteTask(UUID userId, UUID taskId) {
        return taskRepository.findByIdAndUserId(taskId, userId)
            .flatMap(taskRepository::delete);
    }

    @Transactional
    public Flux<Task> syncTasks(UUID userId, List<TaskRequest> taskRequests) {
        final List<TaskRequest> requests = (taskRequests != null) ? taskRequests : List.of();
        final LocalDateTime now = LocalDateTime.now();

        return taskRepository.findByUserIdOrderByPositionAsc(userId)
            .collectList()
            .flatMapMany(existingTasks -> {
                java.util.Map<UUID, Task> existingMap = existingTasks.stream()
                    .collect(java.util.stream.Collectors.toMap(Task::getId, java.util.function.Function.identity(), (a, b) -> a));

                List<Mono<Task>> saveOperations = new ArrayList<>();

                for (int i = 0; i < requests.size(); i++) {
                    TaskRequest req = requests.get(i);
                    int position = i;

                    if (req.id() != null && existingMap.containsKey(req.id())) {
                        Task existing = existingMap.remove(req.id());
                        existing.setText(req.text() != null ? req.text() : "");
                        existing.setDone(req.done() != null ? req.done() : false);
                        existing.setPosition(position);
                        existing.setUpdatedAt(now);
                        saveOperations.add(taskRepository.save(existing));
                    } else {
                        Task newTask = Task.builder()
                            .userId(userId)
                            .text(req.text() != null ? req.text() : "")
                            .done(req.done() != null ? req.done() : false)
                            .position(position)
                            .createdAt(now)
                            .updatedAt(now)
                            .isNewEntity(true)
                            .build();
                        saveOperations.add(taskRepository.save(newTask));
                    }
                }

                Mono<Void> deleteOp = Mono.empty();
                if (!existingMap.isEmpty()) {
                    deleteOp = taskRepository.deleteAll(existingMap.values());
                }

                return deleteOp.thenMany(Flux.concat(saveOperations));
            });
    }

    public Mono<Void> deleteCompletedTasks(UUID userId) {
        return taskRepository.deleteCompletedByUserId(userId);
    }

    public Mono<Void> deleteAllTasks(UUID userId) {
        return taskRepository.deleteAllByUserId(userId);
    }
}
