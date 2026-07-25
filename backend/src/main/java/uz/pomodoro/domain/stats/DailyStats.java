package uz.pomodoro.domain.stats;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Column;
import org.springframework.data.relational.core.mapping.Table;

import java.time.LocalDate;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Table("daily_stats")
public class DailyStats {

    @Id
    private UUID id;

    @Column("user_id")
    private UUID userId;

    private LocalDate date;

    @Column("total_count")
    private Integer totalCount;

    @Column("total_minutes")
    private Integer totalMinutes;
}
