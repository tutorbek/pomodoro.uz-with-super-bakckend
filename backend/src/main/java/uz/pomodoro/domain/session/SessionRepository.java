package uz.pomodoro.domain.session;

import org.springframework.data.r2dbc.repository.Query;
import org.springframework.data.repository.reactive.ReactiveCrudRepository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

public interface SessionRepository extends ReactiveCrudRepository<PomodoroSession, UUID> {

    @Query("SELECT * FROM pomodoro_sessions WHERE user_id = :userId ORDER BY created_at DESC")
    Flux<PomodoroSession> findByUserIdOrderByCreatedAtDesc(UUID userId);

    @Query("SELECT * FROM pomodoro_sessions WHERE id = :id AND user_id = :userId")
    Mono<PomodoroSession> findByIdAndUserId(UUID id, UUID userId);

    @Query("SELECT COUNT(*) FROM pomodoro_sessions WHERE user_id = :userId AND completed = true AND DATE(started_at) = :date")
    Mono<Long> countCompletedByUserToday(UUID userId, LocalDate date);

    @Query("SELECT COUNT(*) FROM pomodoro_sessions WHERE user_id = :userId AND completed = true AND started_at >= :since")
    Mono<Long> countCompletedByUserSince(UUID userId, LocalDateTime since);

    @Query("SELECT COUNT(*) FROM pomodoro_sessions WHERE user_id = :userId AND completed = true")
    Mono<Long> countAllCompletedByUser(UUID userId);

    @Query("SELECT * FROM pomodoro_sessions WHERE completed = true AND started_at BETWEEN :from AND :to")
    Flux<PomodoroSession> findAllCompletedBetween(LocalDateTime from, LocalDateTime to);

    @Query("SELECT * FROM pomodoro_sessions WHERE completed = true AND started_at >= :since")
    Flux<PomodoroSession> findAllCompletedSince(LocalDateTime since);

    @Query("SELECT * FROM pomodoro_sessions WHERE user_id = :userId AND completed = true AND started_at >= :since")
    Flux<PomodoroSession> findCompletedByUserSince(UUID userId, LocalDateTime since);

    @Query("SELECT * FROM pomodoro_sessions WHERE user_id = :userId AND completed = true AND started_at >= :from AND started_at < :toExclusive ORDER BY started_at ASC")
    Flux<PomodoroSession> findCompletedByUserBetween(UUID userId, LocalDateTime from, LocalDateTime toExclusive);

    @Query("SELECT * FROM pomodoro_sessions WHERE user_id = :userId AND started_at >= :from AND started_at < :toExclusive ORDER BY started_at ASC")
    Flux<PomodoroSession> findByUserBetween(UUID userId, LocalDateTime from, LocalDateTime toExclusive);
}
