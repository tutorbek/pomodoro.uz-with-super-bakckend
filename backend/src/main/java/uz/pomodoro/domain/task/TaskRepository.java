package uz.pomodoro.domain.task;

import org.springframework.data.r2dbc.repository.Query;
import org.springframework.data.repository.reactive.ReactiveCrudRepository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.UUID;

public interface TaskRepository extends ReactiveCrudRepository<Task, UUID> {

    @Query("SELECT * FROM tasks WHERE user_id = :userId ORDER BY position ASC, created_at ASC")
    Flux<Task> findByUserIdOrderByPositionAsc(UUID userId);

    @Query("SELECT * FROM tasks WHERE id = :id AND user_id = :userId")
    Mono<Task> findByIdAndUserId(UUID id, UUID userId);

    @Query("DELETE FROM tasks WHERE user_id = :userId AND done = true")
    Mono<Void> deleteCompletedByUserId(UUID userId);

    @Query("DELETE FROM tasks WHERE user_id = :userId")
    Mono<Void> deleteAllByUserId(UUID userId);
}
