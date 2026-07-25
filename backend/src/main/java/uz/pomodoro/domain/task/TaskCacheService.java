package uz.pomodoro.domain.task;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import uz.pomodoro.dto.TaskDto;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class TaskCacheService {

    private final ReactiveStringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    private static final String CACHE_KEY_PREFIX = "tasks:user:";
    private static final Duration CACHE_TTL = Duration.ofMinutes(10);

    public Mono<List<TaskDto>> getCachedTasks(UUID userId) {
        String key = CACHE_KEY_PREFIX + userId;
        return redisTemplate.opsForValue().get(key)
            .flatMap(json -> {
                try {
                    List<TaskDto> tasks = objectMapper.readValue(json, new TypeReference<List<TaskDto>>() {});
                    return Mono.just(tasks);
                } catch (Exception e) {
                    log.warn("Failed to deserialize cached tasks for user {}: {}", userId, e.getMessage());
                    return Mono.empty();
                }
            })
            .onErrorResume(e -> {
                log.debug("Redis read bypass/fallback for user {}: {}", userId, e.getMessage());
                return Mono.empty();
            });
    }

    public Mono<Boolean> cacheTasks(UUID userId, List<TaskDto> tasks) {
        String key = CACHE_KEY_PREFIX + userId;
        try {
            String json = objectMapper.writeValueAsString(tasks != null ? tasks : List.of());
            return redisTemplate.opsForValue().set(key, json, CACHE_TTL)
                .onErrorReturn(false);
        } catch (Exception e) {
            log.warn("Failed to serialize tasks for user {}: {}", userId, e.getMessage());
            return Mono.just(false);
        }
    }

    public Mono<Boolean> evictTasks(UUID userId) {
        String key = CACHE_KEY_PREFIX + userId;
        return redisTemplate.opsForValue().delete(key)
            .onErrorReturn(false);
    }
}
