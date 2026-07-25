package uz.pomodoro.domain.ai;

import org.springframework.data.repository.reactive.ReactiveCrudRepository;
import reactor.core.publisher.Mono;

import java.util.UUID;

public interface AiInsightRepository extends ReactiveCrudRepository<AiInsight, UUID> {
    Mono<AiInsight> findFirstByUserIdOrderByCreatedAtDesc(UUID userId);
}
