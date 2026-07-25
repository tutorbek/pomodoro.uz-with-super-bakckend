package uz.pomodoro.domain.session;

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
@Table("pomodoro_sessions")
public class PomodoroSession {

    @Id
    private UUID id;

    @Column("user_id")
    private UUID userId;

    @Column("started_at")
    private LocalDateTime startedAt;

    @Column("ended_at")
    private LocalDateTime endedAt;

    private Integer duration;

    private Boolean completed;

    private String label;

    @Column("task_id")
    private UUID taskId;

    @Column("created_at")
    private LocalDateTime createdAt;
}
