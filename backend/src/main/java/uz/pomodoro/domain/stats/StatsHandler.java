package uz.pomodoro.domain.stats;

import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import reactor.core.publisher.Mono;

import java.util.UUID;

@Component
@RequiredArgsConstructor
public class StatsHandler {

    private final StatsService statsService;

    public Mono<ServerResponse> getDaily(ServerRequest request) {
        int offset = getOffsetParam(request);
        return currentUserId()
            .flatMap(userId -> statsService.getDaily(userId, offset))
            .flatMap(stats -> ServerResponse.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(stats)
            );
    }

    public Mono<ServerResponse> getWeekly(ServerRequest request) {
        int offset = getOffsetParam(request);
        return currentUserId()
            .flatMap(userId -> statsService.getWeekly(userId, offset))
            .flatMap(stats -> ServerResponse.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(stats)
            );
    }

    public Mono<ServerResponse> getMonthly(ServerRequest request) {
        int offset = getOffsetParam(request);
        return currentUserId()
            .flatMap(userId -> statsService.getMonthly(userId, offset))
            .flatMap(stats -> ServerResponse.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(stats)
            );
    }

    public Mono<ServerResponse> getYearly(ServerRequest request) {
        int offset = getOffsetParam(request);
        return currentUserId()
            .flatMap(userId -> statsService.getYearly(userId, offset))
            .flatMap(stats -> ServerResponse.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(stats)
            );
    }

    private int getOffsetParam(ServerRequest request) {
        return request.queryParam("offset")
            .map(val -> {
                try { return Integer.parseInt(val); } catch (Exception e) { return 0; }
            })
            .orElse(0);
    }

    public Mono<ServerResponse> getSummary(ServerRequest request) {
        return currentUserId()
            .flatMap(statsService::getSummary)
            .flatMap(summary -> ServerResponse.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(summary)
            );
    }

    public Mono<ServerResponse> getFullStats(ServerRequest request) {
        return currentUserId()
            .flatMap(statsService::getFullStats)
            .flatMap(fullStats -> ServerResponse.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(fullStats)
            );
    }

    private Mono<UUID> currentUserId() {
        return ReactiveSecurityContextHolder.getContext()
            .map(context -> context.getAuthentication().getPrincipal())
            .cast(UUID.class);
    }
}
