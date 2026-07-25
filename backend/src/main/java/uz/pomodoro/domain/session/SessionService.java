package uz.pomodoro.domain.session;

import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import uz.pomodoro.dto.SessionRequest;
import uz.pomodoro.event.PomodoroCompletedEvent;

import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class SessionService {

    private final SessionRepository sessionRepository;
    private final ApplicationEventPublisher eventPublisher;

    public Mono<PomodoroSession> startSession(UUID userId, SessionRequest req) {
        LocalDateTime now = LocalDateTime.now();
        PomodoroSession session = PomodoroSession.builder()
            .userId(userId)
            .startedAt(now)
            .duration(req.duration() != null ? req.duration() : 25)
            .label(req.label())
            .taskId(req.taskId())
            .completed(false)
            .createdAt(now)
            .build();

        return sessionRepository.save(session);
    }

    public Mono<PomodoroSession> completeSession(UUID sessionId, UUID userId) {
        return sessionRepository.findByIdAndUserId(sessionId, userId)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND)))
            .filter(session -> !Boolean.TRUE.equals(session.getCompleted()))
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.CONFLICT, "Already completed")))
            .flatMap(session -> {
                session.setCompleted(true);
                session.setEndedAt(LocalDateTime.now());
                return sessionRepository.save(session);
            })
            .doOnSuccess(session -> eventPublisher.publishEvent(new PomodoroCompletedEvent(this, session)));
    }

    public Flux<PomodoroSession> getUserSessions(UUID userId, int page, int size) {
        return sessionRepository.findByUserIdOrderByCreatedAtDesc(userId)
            .skip((long) page * size)
            .take(size);
    }

    public Mono<PomodoroSession> getSession(UUID sessionId, UUID userId) {
        return sessionRepository.findByIdAndUserId(sessionId, userId)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND)));
    }
}
