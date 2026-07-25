package uz.pomodoro.domain.ai;

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
@Table("ai_insights")
public class AiInsight {

    @Id
    private UUID id;

    @Column("user_id")
    private UUID userId;

    @Column("focus_score")
    private Integer focusScore;

    @Column("peak_hours")
    private String peakHours;

    @Column("burnout_risk")
    private String burnoutRisk;

    @Column("summary_text")
    private String summaryText;

    @Column("recommendations_json")
    private String recommendationsJson;

    @Column("created_at")
    private LocalDateTime createdAt;
}
