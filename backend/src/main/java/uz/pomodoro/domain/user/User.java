package uz.pomodoro.domain.user;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Column;
import org.springframework.data.relational.core.mapping.Table;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Table("users")
public class User {

    @Id
    private UUID id;

    private String email;

    private String name;

    @Column("avatar_url")
    private String avatarUrl;

    @Column("telegram_photo_url")
    private String telegramPhotoUrl;

    private String provider;

    @Column("telegram_id")
    private Long telegramId;

    private String username;

    @Column("phone_number")
    private String phoneNumber;

    @Column("first_name")
    private String firstName;

    @Column("last_name")
    private String lastName;

    @Column("language_code")
    private String languageCode;

    @Column("created_at")
    private LocalDateTime createdAt;

    @Column("updated_at")
    private LocalDateTime updatedAt;
}
