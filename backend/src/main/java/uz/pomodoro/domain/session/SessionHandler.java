package uz.pomodoro.domain.session;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import reactor.core.publisher.Mono;
import uz.pomodoro.dto.SessionRequest;
import uz.pomodoro.dto.SessionResponse;

import java.util.UUID;

@Component
@RequiredArgsConstructor
public class SessionHandler {

    private final SessionService sessionService;

    public Mono<ServerResponse> startSession(ServerRequest request) {
        Mono<SessionRequest> sessionRequest = request.bodyToMono(SessionRequest.class)
            .defaultIfEmpty(new SessionRequest(null, null, null));

        return Mono.zip(currentUserId(), sessionRequest)
            .flatMap(tuple -> sessionService.startSession(tuple.getT1(), tuple.getT2()))
            .map(this::toResponse)
            .flatMap(response -> ServerResponse.status(HttpStatus.CREATED)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(response)
            );
    }

    public Mono<ServerResponse> completeSession(ServerRequest request) {
        UUID sessionId = UUID.fromString(request.pathVariable("id"));

        return currentUserId()
            .flatMap(userId -> sessionService.completeSession(sessionId, userId))
            .map(this::toResponse)
            .flatMap(response -> ServerResponse.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(response)
            );
    }

    public Mono<ServerResponse> getSessions(ServerRequest request) {
        int page = queryParamAsInt(request, "page", 0);
        int size = queryParamAsInt(request, "size", 20);

        return currentUserId()
            .flatMapMany(userId -> sessionService.getUserSessions(userId, page, size))
            .map(this::toResponse)
            .collectList()
            .flatMap(responses -> ServerResponse.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(responses)
            );
    }

    public Mono<ServerResponse> getSession(ServerRequest request) {
        UUID sessionId = UUID.fromString(request.pathVariable("id"));

        return currentUserId()
            .flatMap(userId -> sessionService.getSession(sessionId, userId))
            .map(this::toResponse)
            .flatMap(response -> ServerResponse.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(response)
            );
    }

    private Mono<UUID> currentUserId() {
        return ReactiveSecurityContextHolder.getContext()
            .map(context -> context.getAuthentication().getPrincipal())
            .cast(UUID.class);
    }

    private int queryParamAsInt(ServerRequest request, String name, int defaultValue) {
        return request.queryParam(name)
            .map(Integer::parseInt)
            .orElse(defaultValue);
    }

    private SessionResponse toResponse(PomodoroSession session) {
        return new SessionResponse(
            session.getId(),
            session.getDuration(),
            session.getLabel(),
            session.getTaskId(),
            session.getStartedAt(),
            session.getEndedAt(),
            session.getCompleted()
        );
    }
}
