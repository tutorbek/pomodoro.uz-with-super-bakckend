package uz.pomodoro.domain.user;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import reactor.core.publisher.Mono;
import uz.pomodoro.dto.UserUpdateRequest;
import uz.pomodoro.security.JwtService;
import uz.pomodoro.security.TelegramAuthService;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import uz.pomodoro.bot.TelegramBotPoller;
import uz.pomodoro.dto.BugReportRequest;

@Slf4j
@Component
@RequiredArgsConstructor
public class UserHandler {

    private final UserService userService;
    private final JwtService jwtService;
    private final TelegramAuthService telegramAuthService;
    private final ObjectMapper objectMapper;
    private final TelegramBotPoller telegramBotPoller;

    public Mono<ServerResponse> handleTelegramWidgetLogin(ServerRequest request) {
        return request.bodyToMono(Map.class)
            .flatMap(bodyRaw -> {
                Map<String, String> body = new HashMap<>();
                bodyRaw.forEach((k, v) -> {
                    if (v != null && !"null".equalsIgnoreCase(String.valueOf(v))) {
                        body.put(String.valueOf(k), String.valueOf(v));
                    }
                });

                if (!telegramAuthService.validateWidgetData(body)) {
                    log.warn("Telegram Widget authentication failed validation: {}", body);
                    return ServerResponse.status(HttpStatus.UNAUTHORIZED)
                        .contentType(MediaType.APPLICATION_JSON)
                        .bodyValue(Map.of("message", "Invalid Telegram signature"));
                }

                try {
                    Long telegramId = Long.parseLong(body.get("id"));
                    String firstName = body.get("first_name");
                    String lastName = body.get("last_name");
                    String username = body.get("username");
                    String photoUrl = body.get("photo_url");

                    return userService.findOrCreateTelegramUser(telegramId, firstName, lastName, username, photoUrl)
                        .flatMap(user -> {
                            String subject = user.getTelegramId() != null ? user.getTelegramId().toString() : user.getId().toString();
                            String token = jwtService.generateToken(user.getId(), subject);
                            return ServerResponse.ok()
                                .contentType(MediaType.APPLICATION_JSON)
                                .bodyValue(Map.of("token", token, "user", user));
                        });
                } catch (Exception e) {
                    log.error("Error processing Telegram Widget login", e);
                    return ServerResponse.status(HttpStatus.BAD_REQUEST)
                        .contentType(MediaType.APPLICATION_JSON)
                        .bodyValue(Map.of("message", "Invalid user payload"));
                }
            });
    }

    public Mono<ServerResponse> handleTelegramCodeLogin(ServerRequest request) {
        return request.bodyToMono(Map.class)
            .flatMap(body -> {
                String code = (String) body.get("code");
                TelegramAuthService.OtpData otpData = telegramAuthService.validateAndConsumeOtpCode(code);
                if (otpData == null) {
                    log.warn("Invalid or expired OTP code attempt: {}", code);
                    return ServerResponse.status(HttpStatus.UNAUTHORIZED)
                        .contentType(MediaType.APPLICATION_JSON)
                        .bodyValue(Map.of("message", "Kod yaroqsiz yoki 1 daqiqalik muddati o'tgan"));
                }

                return userService.findOrCreateTelegramUser(otpData.telegramId, otpData.firstName, otpData.lastName, otpData.username, otpData.phoneNumber, otpData.languageCode, otpData.photoUrl)
                    .flatMap(user -> {
                        String subject = user.getTelegramId() != null ? user.getTelegramId().toString() : user.getId().toString();
                        String accessToken = jwtService.generateToken(user.getId(), subject, "ROLE_USER");
                        String refreshToken = jwtService.generateRefreshToken(user.getId());
                        return ServerResponse.ok()
                            .contentType(MediaType.APPLICATION_JSON)
                            .bodyValue(Map.of(
                                "token", accessToken,
                                "refreshToken", refreshToken,
                                "user", user
                            ));
                    });
            });
    }

    public Mono<ServerResponse> handleTelegramTmaLogin(ServerRequest request) {
        return request.bodyToMono(Map.class)
            .flatMap(body -> {
                String initData = (String) body.get("initData");
                if (initData == null || !telegramAuthService.validateTmaInitData(initData)) {
                    log.warn("Telegram TMA authentication failed validation");
                    return ServerResponse.status(HttpStatus.UNAUTHORIZED)
                        .contentType(MediaType.APPLICATION_JSON)
                        .bodyValue(Map.of("message", "Invalid Telegram TMA initData"));
                }

                try {
                    String userJson = null;
                    String[] pairs = initData.split("&");
                    for (String pair : pairs) {
                        int idx = pair.indexOf("=");
                        if (idx > 0) {
                            String key = URLDecoder.decode(pair.substring(0, idx), StandardCharsets.UTF_8);
                            if ("user".equals(key)) {
                                userJson = URLDecoder.decode(pair.substring(idx + 1), StandardCharsets.UTF_8);
                                break;
                            }
                        }
                    }

                    if (userJson == null) {
                        return ServerResponse.status(HttpStatus.BAD_REQUEST)
                            .bodyValue(Map.of("message", "User payload missing in initData"));
                    }

                    JsonNode userNode = objectMapper.readTree(userJson);
                    Long telegramId = userNode.get("id").asLong();
                    String firstName = userNode.hasNonNull("first_name") ? userNode.get("first_name").asText() : null;
                    String lastName = userNode.hasNonNull("last_name") ? userNode.get("last_name").asText() : null;
                    String username = userNode.hasNonNull("username") ? userNode.get("username").asText() : null;
                    String photoUrl = userNode.hasNonNull("photo_url") ? userNode.get("photo_url").asText() : null;

                    return userService.findOrCreateTelegramUser(telegramId, firstName, lastName, username, photoUrl)
                        .flatMap(user -> {
                            String subject = user.getTelegramId() != null ? user.getTelegramId().toString() : user.getId().toString();
                            String token = jwtService.generateToken(user.getId(), subject);
                            return ServerResponse.ok()
                                .contentType(MediaType.APPLICATION_JSON)
                                .bodyValue(Map.of("token", token, "user", user));
                        });
                } catch (Exception e) {
                    log.error("Error processing Telegram TMA login", e);
                    return ServerResponse.status(HttpStatus.BAD_REQUEST)
                        .contentType(MediaType.APPLICATION_JSON)
                        .bodyValue(Map.of("message", "Failed to parse TMA user data"));
                }
            });
    }

    public Mono<ServerResponse> getCurrentUser(ServerRequest request) {
        return currentUserId()
            .flatMap(userService::getCurrentUser)
            .flatMap(user -> ServerResponse.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(user)
            )
            .switchIfEmpty(ServerResponse.status(HttpStatus.UNAUTHORIZED)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("message", "Foydalanuvchi topilmadi")));
    }

    public Mono<ServerResponse> updateCurrentUser(ServerRequest request) {
        return currentUserId()
            .zipWith(request.bodyToMono(UserUpdateRequest.class))
            .flatMap(tuple -> userService.updateCurrentUser(
                tuple.getT1(),
                tuple.getT2().name(),
                tuple.getT2().email(),
                tuple.getT2().avatarUrl()
            ))
            .flatMap(user -> ServerResponse.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(user)
            )
            .onErrorResume(DataIntegrityViolationException.class, error -> ServerResponse
                .status(HttpStatus.CONFLICT)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("message", "Email already exists"))
            );
    }

    public Mono<ServerResponse> logout(ServerRequest request) {
        return ServerResponse.ok()
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("message", "Logged out"));
    }

    public Mono<ServerResponse> deleteCurrentUser(ServerRequest request) {
        return currentUserId()
            .flatMap(userId -> userService.deleteCurrentUser(userId)
                .then(ServerResponse.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(Map.of("message", "Account deleted"))
                )
            );
    }

    public Mono<ServerResponse> submitBugReport(ServerRequest request) {
        return ReactiveSecurityContextHolder.getContext()
            .map(ctx -> ctx.getAuthentication())
            .filter(auth -> auth != null && auth.getPrincipal() instanceof UUID)
            .map(auth -> (UUID) auth.getPrincipal())
            .flatMap(userService::findById)
            .flatMap(user -> request.bodyToMono(BugReportRequest.class).map(req -> Map.entry(user, req)))
            .switchIfEmpty(request.bodyToMono(BugReportRequest.class).map(req -> Map.entry(new User(), req)))
            .flatMap(entry -> {
                User user = entry.getKey();
                BugReportRequest req = entry.getValue();

                if (req.description() == null || req.description().trim().length() < 5) {
                    return ServerResponse.badRequest()
                        .contentType(MediaType.APPLICATION_JSON)
                        .bodyValue(Map.of("message", "Xato tavsifi kamida 5 ta belgidan iborat bo'lishi kerak"));
                }

                String fullName;
                if (user.getId() != null) {
                    fullName = (user.getFirstName() != null ? user.getFirstName() : "") +
                            (user.getLastName() != null ? " " + user.getLastName() : "");
                    if (fullName.isBlank()) fullName = user.getUsername() != null ? user.getUsername() : user.getName();
                } else {
                    fullName = "Mehmon Foydalanuvchi (Guest)";
                }

                return telegramBotPoller.sendBugReportToAdmin(
                    fullName,
                    user.getPhoneNumber(),
                    user.getTelegramId(),
                    req.category(),
                    req.description(),
                    req.pageUrl(),
                    req.userAgent()
                ).flatMap(sent -> {
                    log.info("Bug report submitted by user {} (sent to admin: {})", user.getId() != null ? user.getId() : "GUEST", sent);
                    return ServerResponse.ok()
                        .contentType(MediaType.APPLICATION_JSON)
                        .bodyValue(Map.of("message", "Xabaringiz adminga muvaffaqiyatli yetkazildi!"));
                });
            });
    }

    private Mono<UUID> currentUserId() {
        return ReactiveSecurityContextHolder.getContext()
            .filter(context -> context.getAuthentication() != null && context.getAuthentication().getPrincipal() instanceof UUID)
            .map(context -> (UUID) context.getAuthentication().getPrincipal())
            .switchIfEmpty(Mono.error(new org.springframework.web.server.ResponseStatusException(
                HttpStatus.UNAUTHORIZED, "Tizimga kirilmagan"
            )));
    }
}
