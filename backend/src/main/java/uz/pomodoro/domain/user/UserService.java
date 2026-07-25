package uz.pomodoro.domain.user;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;

    public Mono<User> findOrCreateTelegramUser(Long telegramId, String firstName, String lastName, String username, String phoneNumber, String languageCode, String photoUrl) {
        if (telegramId == null) {
            return Mono.error(new IllegalArgumentException("Telegram ID cannot be null"));
        }

        String displayName = ((firstName != null ? firstName : "") + " " + (lastName != null ? lastName : "")).trim();
        if (displayName.isBlank()) {
            displayName = (username != null && !username.isBlank()) ? username : "Telegram User";
        }
        final String finalName = displayName;

        return userRepository.findByTelegramId(telegramId)
            .flatMap(existingUser -> {
                existingUser.setName(finalName);
                if (firstName != null && !firstName.isBlank()) existingUser.setFirstName(firstName);
                if (lastName != null && !lastName.isBlank()) existingUser.setLastName(lastName);
                if (phoneNumber != null && !phoneNumber.isBlank()) existingUser.setPhoneNumber(phoneNumber);
                if (languageCode != null && !languageCode.isBlank()) existingUser.setLanguageCode(languageCode);
                if (photoUrl != null && !photoUrl.isBlank()) {
                    existingUser.setTelegramPhotoUrl(photoUrl);
                    if (existingUser.getAvatarUrl() == null || existingUser.getAvatarUrl().isBlank() || "cat".equalsIgnoreCase(existingUser.getAvatarUrl())) {
                        existingUser.setAvatarUrl(photoUrl);
                    }
                } else if (existingUser.getAvatarUrl() == null || existingUser.getAvatarUrl().isBlank() || "cat".equalsIgnoreCase(existingUser.getAvatarUrl())) {
                    existingUser.setAvatarUrl("telegram");
                }
                if (username != null && !username.isBlank()) existingUser.setUsername(username);
                existingUser.setUpdatedAt(LocalDateTime.now());
                return userRepository.save(existingUser);
            })
            .switchIfEmpty(Mono.defer(() -> {
                LocalDateTime now = LocalDateTime.now();
                String defaultAvatar = (photoUrl != null && !photoUrl.isBlank()) ? photoUrl : "telegram";
                User user = User.builder()
                    .telegramId(telegramId)
                    .username(username)
                    .name(finalName)
                    .firstName(firstName)
                    .lastName(lastName)
                    .phoneNumber(phoneNumber)
                    .languageCode(languageCode)
                    .telegramPhotoUrl(photoUrl)
                    .avatarUrl(defaultAvatar)
                    .provider("telegram")
                    .createdAt(now)
                    .updatedAt(now)
                    .build();

                return userRepository.save(user);
            }));
    }

    public Mono<User> findOrCreateTelegramUser(Long telegramId, String firstName, String lastName, String username, String photoUrl) {
        return findOrCreateTelegramUser(telegramId, firstName, lastName, username, null, null, photoUrl);
    }

    public Mono<Boolean> hasPhoneNumber(Long telegramId) {
        if (telegramId == null) return Mono.just(false);
        return userRepository.findByTelegramId(telegramId)
            .map(user -> user.getPhoneNumber() != null && !user.getPhoneNumber().isBlank())
            .defaultIfEmpty(false);
    }

    public Mono<User> findByTelegramId(Long telegramId) {
        if (telegramId == null) return Mono.empty();
        return userRepository.findByTelegramId(telegramId);
    }

    public Mono<Long> countUsers() {
        return userRepository.count();
    }

    public Mono<User> findById(UUID id) {
        return userRepository.findById(id);
    }

    public Mono<User> getCurrentUser(UUID userId) {
        return findById(userId);
    }

    public Mono<User> updateCurrentUser(UUID userId, String name, String email, String avatarUrl) {
        return findById(userId)
            .flatMap(user -> {
                if (name != null && !name.isBlank()) {
                    user.setName(name.trim());
                }
                if (email != null && !email.isBlank()) {
                    user.setEmail(email.trim().toLowerCase());
                }
                if (avatarUrl != null && !avatarUrl.isBlank()) {
                    user.setAvatarUrl(avatarUrl.trim());
                }
                user.setUpdatedAt(LocalDateTime.now());
                return userRepository.save(user);
            });
    }

    public Mono<Void> deleteCurrentUser(UUID userId) {
        return userRepository.deleteById(userId);
    }
}
