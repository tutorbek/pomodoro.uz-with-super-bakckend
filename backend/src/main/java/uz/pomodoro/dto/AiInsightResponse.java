package uz.pomodoro.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiInsightResponse {
    private Integer focusScore;
    private String peakHours;
    private String burnoutRisk;
    private String summaryText;
    private List<String> recommendations;
    private LocalDateTime generatedAt;
}
