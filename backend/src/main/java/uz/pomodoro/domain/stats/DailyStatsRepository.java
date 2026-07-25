package uz.pomodoro.domain.stats;

import org.springframework.data.r2dbc.repository.Modifying;
import org.springframework.data.r2dbc.repository.Query;
import org.springframework.data.repository.reactive.ReactiveCrudRepository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.time.LocalDate;
import java.util.UUID;

public interface DailyStatsRepository extends ReactiveCrudRepository<DailyStats, UUID> {

    Mono<DailyStats> findByUserIdAndDate(UUID userId, LocalDate date);

    Flux<DailyStats> findByUserId(UUID userId);

    @Modifying
    @Query("""
        INSERT INTO daily_stats (user_id, date, total_count, total_minutes)
        VALUES (:userId, :date, :totalCount, :totalMinutes)
        ON CONFLICT (user_id, date)
        DO UPDATE SET
            total_count = :totalCount,
            total_minutes = :totalMinutes
        """)
    Mono<Integer> upsert(UUID userId, LocalDate date, int totalCount, int totalMinutes);
}
