package uz.pomodoro.domain.ai;

import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import reactor.core.publisher.Mono;

import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class AiHandler {

    private final AiService aiService;

    public Mono<ServerResponse> getInsight(ServerRequest request) {
        return currentUserId()
            .flatMap(aiService::getOrGenerateInsight)
            .flatMap(response -> ServerResponse.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(response)
            );
    }

    public Mono<ServerResponse> refreshInsight(ServerRequest request) {
        return currentUserId()
            .flatMap(aiService::refreshInsight)
            .flatMap(response -> ServerResponse.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(response)
            );
    }

    public Mono<ServerResponse> askCoach(ServerRequest request) {
        return currentUserId()
            .zipWith(request.bodyToMono(Map.class))
            .flatMap(tuple -> {
                UUID userId = tuple.getT1();
                String question = (String) tuple.getT2().get("question");
                if (question == null || question.isBlank()) {
                    return ServerResponse.badRequest()
                        .contentType(MediaType.APPLICATION_JSON)
                        .bodyValue(Map.of("error", "Question cannot be empty"));
                }
                return aiService.askAiCoach(userId, question)
                    .flatMap(answer -> ServerResponse.ok()
                        .contentType(MediaType.APPLICATION_JSON)
                        .bodyValue(Map.of("answer", answer)));
            });
    }

    private Mono<UUID> currentUserId() {
        return ReactiveSecurityContextHolder.getContext()
            .map(context -> context.getAuthentication().getPrincipal())
            .cast(UUID.class);
    }
}
