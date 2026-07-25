package uz.pomodoro.domain.ai;

import reactor.core.publisher.Mono;
import uz.pomodoro.dto.AiInsightResponse;

import java.util.UUID;

public interface AiService {
    Mono<AiInsightResponse> getOrGenerateInsight(UUID userId);
    Mono<AiInsightResponse> refreshInsight(UUID userId);
    Mono<String> askAiCoach(UUID userId, String question);
}
