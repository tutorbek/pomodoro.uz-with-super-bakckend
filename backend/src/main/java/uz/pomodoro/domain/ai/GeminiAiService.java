package uz.pomodoro.domain.ai;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import uz.pomodoro.domain.session.PomodoroSession;
import uz.pomodoro.domain.session.SessionRepository;
import uz.pomodoro.dto.AiInsightResponse;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class GeminiAiService implements AiService {

    @Value("${app.ai.gemini-api-key:}")
    private String apiKey;

    @Value("${app.ai.model:gemini-1.5-flash}")
    private String modelName;

    private final AiInsightRepository aiInsightRepository;
    private final SessionRepository sessionRepository;
    private final ObjectMapper objectMapper;
    private final WebClient webClient = WebClient.builder().build();

    @Override
    public Mono<AiInsightResponse> getOrGenerateInsight(UUID userId) {
        return aiInsightRepository.findFirstByUserIdOrderByCreatedAtDesc(userId)
            .flatMap(insight -> {
                // If generated within last 12 hours, return cached
                if (insight.getCreatedAt().isAfter(LocalDateTime.now().minusHours(12))) {
                    return Mono.just(mapToResponse(insight));
                } else {
                    return generateNewInsight(userId);
                }
            })
            .switchIfEmpty(Mono.defer(() -> generateNewInsight(userId)));
    }

    @Override
    public Mono<AiInsightResponse> refreshInsight(UUID userId) {
        return generateNewInsight(userId);
    }

    @Override
    public Mono<String> askAiCoach(UUID userId, String question) {
        LocalDateTime since = LocalDateTime.now().minusDays(7);
        return sessionRepository.findCompletedByUserSince(userId, since)
            .collectList()
            .flatMap(sessions -> {
                if (apiKey == null || apiKey.isBlank()) {
                    return Mono.just("Aka, Gemini API kalit o'rnatilmagani sababli AI Coach hozircha offline rejimda. Bugun siz " + sessions.size() + " ta pomodoro bajardingiz!");
                }

                String prompt = buildCoachPrompt(sessions, question);
                return callGeminiApi(prompt)
                    .onErrorReturn("Kechirasiz, xatolik yuz berdi. Bir ozdan so'ng qayta urinib ko'ring.");
            });
    }

    private Mono<AiInsightResponse> generateNewInsight(UUID userId) {
        LocalDateTime since = LocalDateTime.now().minusDays(7);
        return sessionRepository.findCompletedByUserSince(userId, since)
            .collectList()
            .flatMap(sessions -> {
                if (apiKey != null && !apiKey.isBlank()) {
                    String prompt = buildAnalysisPrompt(sessions);
                    return callGeminiApi(prompt)
                        .flatMap(rawJson -> parseAndSaveInsight(userId, rawJson))
                        .onErrorResume(ex -> {
                            log.error("Gemini API call failed, falling back to rule-based analysis", ex);
                            return generateFallbackInsight(userId, sessions);
                        });
                } else {
                    log.info("GEMINI_API_KEY is empty. Generating rule-based AI insight.");
                    return generateFallbackInsight(userId, sessions);
                }
            });
    }

    private String buildAnalysisPrompt(List<PomodoroSession> sessions) {
        StringBuilder sb = new StringBuilder();
        sb.append("Foydalanuvchining so'nggi 7 kunlik Pomodoro sessiyalari:\n");
        if (sessions.isEmpty()) {
            sb.append("Foydalanuvchi hali bitta ham sessiya bajarmagan.\n");
        } else {
            for (PomodoroSession s : sessions) {
                sb.append(String.format("- Boshlangan vaqt: %s, davomiyligi: %d minut, label: %s\n",
                    s.getStartedAt(), s.getDuration(), s.getLabel() != null ? s.getLabel() : "Umumiy"));
            }
        }

        sb.append("""
            
            Ushbu ma'lumotlar asosida foydalanuvchi uchun mahsuldorlik tahlilini amalga oshiring va EXACTLY quyidagi JSON formatida javob bering (boshqa hech qanday text qo'shmang):
            {
              "focusScore": 85,
              "peakHours": "09:00 - 11:30",
              "burnoutRisk": "LOW",
              "summaryText": "O'zbek tilida 2 ta jumladan iborat umumiy tahlil matni",
              "recommendations": [
                "O'zbek tilida 1-maslahat",
                "O'zbek tilida 2-maslahat",
                "O'zbek tilida 3-maslahat"
              ]
            }
            Bajariladigan shartlar:
            - focusScore: 0 dan 100 gacha raqam.
            - burnoutRisk: 'LOW', 'MEDIUM', yoki 'HIGH'.
            - peakHours: eng ko'p sessiyalar bajarilgan vaqt diapazoni.
            - summaryText va recommendations to'liq o'zbek tilida bo'lsin.
            """);

        return sb.toString();
    }

    private String buildCoachPrompt(List<PomodoroSession> sessions, String question) {
        return String.format("""
            Siz Pomodoro.uz loyihasining aqlli AI Murabbiyisiz (Productivity Coach).
            Foydalanuvchining so'nggi 7 kunda bajarilgan pomodoro sessiyalari soni: %d.
            
            Foydalanuvchining savoli: "%s"
            
            Foydalanuvchiga do'stona, muloyim va rag'batlantiruvchi tonda o'zbek tilida javob bering. Javob qisqa va aniq (maximum 3-4 sentence) bo'lsin.
            """, sessions.size(), question);
    }

    private Mono<String> callGeminiApi(String prompt) {
        String url = String.format("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", modelName, apiKey);

        Map<String, Object> body = Map.of(
            "contents", List.of(
                Map.of("parts", List.of(
                    Map.of("text", prompt)
                ))
            )
        );

        return webClient.post()
            .uri(url)
            .bodyValue(body)
            .retrieve()
            .bodyToMono(String.class)
            .map(responseJson -> {
                try {
                    JsonNode root = objectMapper.readTree(responseJson);
                    return root.path("candidates").get(0)
                        .path("content").path("parts").get(0)
                        .path("text").asText();
                } catch (Exception e) {
                    throw new RuntimeException("Failed to extract Gemini text", e);
                }
            });
    }

    private Mono<AiInsightResponse> parseAndSaveInsight(UUID userId, String rawJson) {
        try {
            String cleanJson = rawJson.trim();
            if (cleanJson.startsWith("```json")) {
                cleanJson = cleanJson.substring(7);
            }
            if (cleanJson.startsWith("```")) {
                cleanJson = cleanJson.substring(3);
            }
            if (cleanJson.endsWith("```")) {
                cleanJson = cleanJson.substring(0, cleanJson.length() - 3);
            }
            cleanJson = cleanJson.trim();

            JsonNode node = objectMapper.readTree(cleanJson);
            int focusScore = node.path("focusScore").asInt(75);
            String peakHours = node.path("peakHours").asText("09:00 - 12:00");
            String burnoutRisk = node.path("burnoutRisk").asText("LOW");
            String summaryText = node.path("summaryText").asText("So'nggi haftada mahsuldorlik ko'rsatkichingiz yaxshi bo'ldi.");

            List<String> recs = new ArrayList<>();
            if (node.has("recommendations") && node.get("recommendations").isArray()) {
                for (JsonNode r : node.get("recommendations")) {
                    recs.add(r.asText());
                }
            }
            if (recs.isEmpty()) {
                recs = List.of("Tanaffuslarni o'z vaqtida oling.", "Ertalabki soatlardan samarali foydalaning.", "Diqqatni bir vazifaga qaratishda davom eting.");
            }

            AiInsight insight = AiInsight.builder()
                .userId(userId)
                .focusScore(focusScore)
                .peakHours(peakHours)
                .burnoutRisk(burnoutRisk)
                .summaryText(summaryText)
                .recommendationsJson(objectMapper.writeValueAsString(recs))
                .createdAt(LocalDateTime.now())
                .build();

            return aiInsightRepository.save(insight)
                .map(this::mapToResponse);
        } catch (Exception e) {
            log.error("Failed to parse Gemini JSON output: {}", rawJson, e);
            return generateFallbackInsight(userId, Collections.emptyList());
        }
    }

    private Mono<AiInsightResponse> generateFallbackInsight(UUID userId, List<PomodoroSession> sessions) {
        int count = sessions.size();
        int focusScore = Math.min(100, Math.max(30, count * 10));
        String peakHours = "09:00 - 11:30";
        String burnoutRisk = count > 25 ? "MEDIUM" : "LOW";
        String summaryText = String.format("So'nggi 7 kunda siz %d ta pomodoro sessiyani yakunladingiz. Mahsuldorlik ko'rsatkichingiz: %d/100.", count, focusScore);

        List<String> recommendations = List.of(
            "Eng muhim vazifalarni ertalab soat 09:00 va 12:00 oralig'ida rejalashtiring.",
            "Har 4 ta sessiyadan so'ng 15-20 minutlik uzoq tanaffus qiling.",
            "Kechki soat 20:00 dan keyin miyaga dam bering va toza havoda sayr qiling."
        );

        try {
            AiInsight insight = AiInsight.builder()
                .userId(userId)
                .focusScore(focusScore)
                .peakHours(peakHours)
                .burnoutRisk(burnoutRisk)
                .summaryText(summaryText)
                .recommendationsJson(objectMapper.writeValueAsString(recommendations))
                .createdAt(LocalDateTime.now())
                .build();

            return aiInsightRepository.save(insight)
                .map(this::mapToResponse);
        } catch (Exception e) {
            return Mono.just(AiInsightResponse.builder()
                .focusScore(focusScore)
                .peakHours(peakHours)
                .burnoutRisk(burnoutRisk)
                .summaryText(summaryText)
                .recommendations(recommendations)
                .generatedAt(LocalDateTime.now())
                .build());
        }
    }

    private AiInsightResponse mapToResponse(AiInsight insight) {
        List<String> recs = Collections.emptyList();
        try {
            if (insight.getRecommendationsJson() != null) {
                recs = objectMapper.readValue(insight.getRecommendationsJson(), new TypeReference<List<String>>() {});
            }
        } catch (Exception e) {
            log.error("Failed to deserialize recommendations JSON", e);
        }

        return AiInsightResponse.builder()
            .focusScore(insight.getFocusScore())
            .peakHours(insight.getPeakHours())
            .burnoutRisk(insight.getBurnoutRisk())
            .summaryText(insight.getSummaryText())
            .recommendations(recs)
            .generatedAt(insight.getCreatedAt())
            .build();
    }
}
