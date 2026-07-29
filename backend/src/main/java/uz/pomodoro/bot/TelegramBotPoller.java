package uz.pomodoro.bot;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import uz.pomodoro.domain.stats.StatsService;
import uz.pomodoro.domain.user.User;
import uz.pomodoro.domain.user.UserService;
import uz.pomodoro.dto.StatsResponse;
import uz.pomodoro.security.TelegramAuthService;

import reactor.core.publisher.Mono;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class TelegramBotPoller {

    private final TelegramAuthService telegramAuthService;
    private final UserService userService;
    private final StatsService statsService;
    private final WebClient.Builder webClientBuilder;
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(4);

    @Value("${telegram.bot.token:}")
    private String botToken;

    @Value("${app.frontend-url:https://pomodoro.uz}")
    private String frontendUrl;

    private long lastUpdateId = 0;

    private String escapeHtml(String text) {
        if (text == null) return "";
        return text.replace("&", "&amp;")
                   .replace("<", "&lt;")
                   .replace(">", "&gt;");
    }

    @EventListener(ApplicationReadyEvent.class)
    public void startPolling() {
        if (botToken == null || botToken.isBlank()) {
            log.warn("Telegram bot token is not configured. Telegram bot poller will not start.");
            return;
        }
        log.info("Starting Telegram Bot Long-Polling for @PomodoroUzBot (Frontend URL: {})...", frontendUrl);
        WebClient webClient = webClientBuilder.baseUrl("https://api.telegram.org/bot" + botToken.trim()).build();

        // Register bot commands with Telegram
        registerBotCommands(webClient);

        Thread.ofVirtual().name("telegram-bot-poller").start(() -> {
            while (!Thread.currentThread().isInterrupted()) {
                try {
                    pollUpdates(webClient);
                    Thread.sleep(1000);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                } catch (Exception e) {
                    log.warn("Telegram bot polling error: {}", e.getMessage());
                    try {
                        Thread.sleep(3000);
                    } catch (InterruptedException ex) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }
        });
    }

    @SuppressWarnings("unchecked")
    private void registerBotCommands(WebClient webClient) {
        try {
            List<Map<String, String>> commands = List.of(
                    Map.of("command", "start", "description", "Botni ishga tushirish"),
                    Map.of("command", "login", "description", "Saytga kirish kodi olish"),
                    Map.of("command", "stats", "description", "Statistikalar va hisobotlar"),
                    Map.of("command", "taskstats", "description", "Vazifalar bo'yicha hisobot"),
                    Map.of("command", "about", "description", "Loyiha haqida ma'lumot")
            );

            Map<String, Object> body = Map.of("commands", commands);

            Map<String, Object> response = webClient.post()
                    .uri("/setMyCommands")
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block(Duration.ofSeconds(10));

            if (response != null && Boolean.TRUE.equals(response.get("ok"))) {
                log.info("Bot commands registered successfully: /start, /login, /stats, /taskstats, /about");
            } else {
                log.warn("Failed to register bot commands: {}", response);
            }
        } catch (Exception e) {
            log.warn("Error registering bot commands: {}", e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private void pollUpdates(WebClient webClient) {
        Map<String, Object> response = webClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/getUpdates")
                        .queryParam("offset", lastUpdateId + 1)
                        .queryParam("timeout", 10)
                        .build())
                .retrieve()
                .bodyToMono(Map.class)
                .block(Duration.ofSeconds(15));

        if (response != null && Boolean.TRUE.equals(response.get("ok"))) {
            List<Map<String, Object>> result = (List<Map<String, Object>>) response.get("result");
            if (result != null) {
                for (Map<String, Object> update : result) {
                    Number updateId = (Number) update.get("update_id");
                    if (updateId != null) {
                        lastUpdateId = Math.max(lastUpdateId, updateId.longValue());
                    }
                    if (update.containsKey("message")) {
                        processMessage(webClient, (Map<String, Object>) update.get("message"));
                    } else if (update.containsKey("callback_query")) {
                        processCallbackQuery(webClient, (Map<String, Object>) update.get("callback_query"));
                    }
                }
            }
        }
    }

    @SuppressWarnings("unchecked")
    private void processMessage(WebClient webClient, Map<String, Object> message) {
        if (message == null) return;

        Map<String, Object> from = (Map<String, Object>) message.get("from");
        Map<String, Object> chat = (Map<String, Object>) message.get("chat");
        if (from == null || chat == null) return;

        Long telegramId = ((Number) from.get("id")).longValue();
        Long chatId = ((Number) chat.get("id")).longValue();
        String username = (String) from.get("username");
        String firstName = (String) from.get("first_name");
        if (firstName == null || firstName.isBlank()) {
            firstName = "Foydalanuvchi";
        }

        String text = (String) message.get("text");
        String command = text != null ? text.trim() : "";

        String lastName = (String) from.get("last_name");
        String languageCode = (String) from.get("language_code");
        String phoneNumber = null;

        if (message.containsKey("contact")) {
            Map<String, Object> contact = (Map<String, Object>) message.get("contact");
            if (contact != null) {
                if (contact.containsKey("phone_number")) {
                    phoneNumber = (String) contact.get("phone_number");
                }
                if (contact.containsKey("first_name") && contact.get("first_name") != null) {
                    firstName = (String) contact.get("first_name");
                }
                if (contact.containsKey("last_name") && contact.get("last_name") != null) {
                    lastName = (String) contact.get("last_name");
                }
            }
        }

        String photoUrl = getUserProfilePhotoUrl(webClient, telegramId);
        boolean userHasPhone = Boolean.TRUE.equals(userService.hasPhoneNumber(telegramId).block());

        if (message.containsKey("contact")) {
            // Save/update user in DB including contact phone_number and photoUrl
            userService.findOrCreateTelegramUser(telegramId, firstName, lastName, username, phoneNumber, languageCode, photoUrl).block();
            userHasPhone = true;

            // Send persistent main reply keyboard with 4 quick buttons
            Map<String, Object> mainReplyKeyboard = createMainReplyKeyboard();
            sendMessage(webClient, chatId, "✅ Telefon raqamingiz muvaffaqiyatli qabul qilindi!", mainReplyKeyboard);

            try {
                Thread.sleep(250);
            } catch (InterruptedException ignored) {}

            TelegramAuthService.OtpResult result = telegramAuthService.getOrGenerateOtpResult(telegramId, username, firstName, lastName, phoneNumber, languageCode, photoUrl);
            int remainingSec = telegramAuthService.getRemainingSecondsForUser(telegramId);
            String replyText = buildOtpMessage(result.code(), remainingSec > 0 ? remainingSec : 60, result.isNew());

            Map<String, Object> inlineMarkup = createInlineKeyboard(result.code());
            Long sentMessageId = sendMessage(webClient, chatId, replyText, inlineMarkup);
            if (sentMessageId != null) {
                scheduleExpirationTask(webClient, chatId, sentMessageId, remainingSec > 0 ? remainingSec : 60);
            }
        } else if (command.contains("Pomodoro Nima") || command.contains("Pomodoro nima") || command.contains("pomodoro nima")) {
            String explanation = buildPomodoroExplanationMessage();
            Map<String, Object> inlineMarkup = createAboutInlineKeyboard();
            sendMessage(webClient, chatId, explanation, inlineMarkup);
        } else if (command.startsWith("/taskstats") || command.startsWith("/mytasktime") || command.contains("Vazifalar hisoboti")) {
            if (!userHasPhone) {
                String replyText = buildStartContactRequestMessage(firstName);
                Map<String, Object> replyKeyboard = createContactReplyKeyboard();
                sendMessage(webClient, chatId, replyText, replyKeyboard);
                return;
            }
            User user = userService.findByTelegramId(telegramId).block();
            if (user == null) {
                user = userService.findOrCreateTelegramUser(telegramId, firstName, lastName, username, phoneNumber, languageCode, photoUrl).block();
            }

            String activePeriod = "weekly";
            String taskStatsReply = buildTaskStatsMessageForPeriod(user, activePeriod, 0);
            Map<String, Object> inlineMarkup = createTaskStatsInlineKeyboard(activePeriod, 0);
            sendMessage(webClient, chatId, taskStatsReply, inlineMarkup);
        } else if (command.startsWith("/stats") || command.startsWith("/daily") || command.startsWith("/weekly") || command.startsWith("/monthly") || command.startsWith("/summary") || (command.contains("Hisobotlar") && !command.contains("Vazifalar"))) {
            if (!userHasPhone) {
                String replyText = buildStartContactRequestMessage(firstName);
                Map<String, Object> replyKeyboard = createContactReplyKeyboard();
                sendMessage(webClient, chatId, replyText, replyKeyboard);
                return;
            }
            User user = userService.findByTelegramId(telegramId).block();
            if (user == null) {
                user = userService.findOrCreateTelegramUser(telegramId, firstName, lastName, username, phoneNumber, languageCode, photoUrl).block();
            }

            String activePeriod = "daily";
            if (command.startsWith("/weekly")) activePeriod = "weekly";
            else if (command.startsWith("/monthly")) activePeriod = "monthly";
            else if (command.startsWith("/summary")) activePeriod = "summary";

            String statsReply = buildStatsMessageForPeriod(user, activePeriod, 0);
            Map<String, Object> inlineMarkup = createStatsInlineKeyboard(activePeriod, 0);
            sendMessage(webClient, chatId, statsReply, inlineMarkup);
        } else if (command.startsWith("/admin")) {
            Long totalUsers = userService.countUsers().blockOptional().orElse(0L);
            Long totalSessions = statsService.countTotalSessions().blockOptional().orElse(0L);
            String adminReply = "👑 <b>Admin Boshqaruv Paneli</b>\n\n" +
                    "👥 Jami foydalanuvchilar: <b>" + totalUsers + " ta</b>\n" +
                    "🍅 Jami bajarilgan Pomodorolar: <b>" + totalSessions + " ta</b>\n" +
                    "⚡️ Platforma statusi: <b>FAOL (Online 🟢)</b>\n\n" +
                    "🌐 <b>Veb-sayt:</b> <a href=\"" + (frontendUrl != null ? frontendUrl.trim() : "https://pomodoro.uz") + "\">pomodoro.uz</a>";
            sendMessage(webClient, chatId, adminReply, null);
        } else if (command.startsWith("/about") || command.contains("Loyiha haqida")) {
            String aboutReply = buildAboutMessage();
            Map<String, Object> inlineMarkup = createAboutInlineKeyboard();
            sendMessage(webClient, chatId, aboutReply, inlineMarkup);
        } else if (command.startsWith("/start") || !userHasPhone) {
            // Under NO circumstances give code if user has no phone_number in DB!
            String replyText = buildStartContactRequestMessage(firstName);
            Map<String, Object> replyKeyboard = createContactReplyKeyboard();
            sendMessage(webClient, chatId, replyText, replyKeyboard);
        } else if (command.startsWith("/login") || !command.isBlank()) {
            TelegramAuthService.OtpResult result = telegramAuthService.getOrGenerateOtpResult(telegramId, username, firstName, lastName, phoneNumber, languageCode, photoUrl);
            int remainingSec = telegramAuthService.getRemainingSecondsForUser(telegramId);
            String replyText = buildOtpMessage(result.code(), remainingSec > 0 ? remainingSec : 60, result.isNew());

            Map<String, Object> inlineMarkup = createInlineKeyboard(result.code());
            Long sentMessageId = sendMessage(webClient, chatId, replyText, inlineMarkup);
            if (sentMessageId != null) {
                scheduleExpirationTask(webClient, chatId, sentMessageId, remainingSec > 0 ? remainingSec : 60);
            }
        } else {
            String replyText = buildStartContactRequestMessage(firstName);
            Map<String, Object> replyKeyboard = createContactReplyKeyboard();
            sendMessage(webClient, chatId, replyText, replyKeyboard);
        }
    }

    @SuppressWarnings("unchecked")
    private void processCallbackQuery(WebClient webClient, Map<String, Object> callbackQuery) {
        if (callbackQuery == null) return;

        String callbackQueryId = (String) callbackQuery.get("id");
        String data = (String) callbackQuery.get("data");
        Map<String, Object> from = (Map<String, Object>) callbackQuery.get("from");
        Map<String, Object> message = (Map<String, Object>) callbackQuery.get("message");

        if (from == null || message == null) return;

        Long telegramId = ((Number) from.get("id")).longValue();
        Map<String, Object> chat = (Map<String, Object>) message.get("chat");
        Long chatId = ((Number) chat.get("id")).longValue();
        Number messageId = (Number) message.get("message_id");
        String username = (String) from.get("username");
        String firstName = (String) from.get("first_name");
        if (firstName == null || firstName.isBlank()) {
            firstName = "Foydalanuvchi";
        }

        boolean userHasPhone = Boolean.TRUE.equals(userService.hasPhoneNumber(telegramId).block());

        if (data != null && data.startsWith("taskstats_")) {
            if (!userHasPhone) {
                answerCallbackQuery(webClient, callbackQueryId, "Iltimos, avval kontaktingizni yuboring!", true);
                String replyText = buildStartContactRequestMessage(firstName);
                Map<String, Object> replyKeyboard = createContactReplyKeyboard();
                sendMessage(webClient, chatId, replyText, replyKeyboard);
                return;
            }
            User user = userService.findByTelegramId(telegramId).block();
            if (user == null) {
                user = userService.findOrCreateTelegramUser(telegramId, firstName, null, username, null, null, null).block();
            }

            String activePeriod = "weekly";
            int offset = 0;
            String[] parts = data.split("_");
            if (parts.length >= 2) {
                activePeriod = parts[1];
            }
            if (parts.length >= 3) {
                try {
                    offset = Integer.parseInt(parts[2]);
                } catch (NumberFormatException ignored) {}
            }

            String updatedText = buildTaskStatsMessageForPeriod(user, activePeriod, offset);
            Map<String, Object> newInlineMarkup = createTaskStatsInlineKeyboard(activePeriod, offset);

            editMessageText(webClient, chatId, messageId.longValue(), updatedText, newInlineMarkup);
            answerCallbackQuery(webClient, callbackQueryId, "Vazifalar statistikasi yangilandi! 📋", false);
            return;
        } else if (data != null && data.startsWith("stats_")) {
            if (!userHasPhone) {
                answerCallbackQuery(webClient, callbackQueryId, "Iltimos, avval kontaktingizni yuboring!", true);
                String replyText = buildStartContactRequestMessage(firstName);
                Map<String, Object> replyKeyboard = createContactReplyKeyboard();
                sendMessage(webClient, chatId, replyText, replyKeyboard);
                return;
            }
            User user = userService.findByTelegramId(telegramId).block();
            if (user == null) {
                user = userService.findOrCreateTelegramUser(telegramId, firstName, null, username, null, null, null).block();
            }

            String activePeriod = "daily";
            int offset = 0;
            String[] parts = data.split("_");
            if (parts.length >= 2) {
                activePeriod = parts[1];
            }
            if (parts.length >= 3) {
                try {
                    offset = Integer.parseInt(parts[2]);
                } catch (NumberFormatException ignored) {}
            }

            String updatedText = buildStatsMessageForPeriod(user, activePeriod, offset);
            Map<String, Object> newInlineMarkup = createStatsInlineKeyboard(activePeriod, offset);

            editMessageText(webClient, chatId, messageId.longValue(), updatedText, newInlineMarkup);
            answerCallbackQuery(webClient, callbackQueryId, "Hisobot yangilandi! 📊", false);
            return;
        } else if ("renew_otp".equals(data)) {
            if (!userHasPhone) {
                answerCallbackQuery(webClient, callbackQueryId, "Iltimos, avval kontaktingizni yuboring!", true);
                String replyText = buildStartContactRequestMessage(firstName);
                Map<String, Object> replyKeyboard = createContactReplyKeyboard();
                sendMessage(webClient, chatId, replyText, replyKeyboard);
                return;
            }

            int cooldownSec = telegramAuthService.getRenewCooldownRemainingSeconds(telegramId);
            if (cooldownSec > 0) {
                answerCallbackQuery(webClient, callbackQueryId, "⏱ Yangi kod olish uchun iltimos " + cooldownSec + " soniya kuting!", true);
                return;
            }

            String photoUrl = getUserProfilePhotoUrl(webClient, telegramId);
            // Force generate a fresh 60s OTP code on renew click
            String newCode = telegramAuthService.forceGenerateOtpCode(telegramId, username, firstName, null, null, null, photoUrl);
            String updatedText = buildOtpMessage(newCode, 60, true);
            Map<String, Object> newInlineMarkup = createInlineKeyboard(newCode);

            editMessageText(webClient, chatId, messageId.longValue(), updatedText, newInlineMarkup);
            answerCallbackQuery(webClient, callbackQueryId, "Yangi 1 daqiqalik kod yaratildi! ⚡", false);
            scheduleExpirationTask(webClient, chatId, messageId.longValue(), 60);
        }
    }

    private void scheduleExpirationTask(WebClient webClient, Long chatId, Long messageId, int seconds) {
        if (messageId == null) return;
        scheduler.schedule(() -> {
            try {
                String expiredText = "🔒 <b>Kod muddati tugadi / Code expired</b>\n\n" +
                        "Yangi kod olish uchun 🔄 <b>Yangilash / Renew</b> tugmasini bosing yoki /login yuboring.";
                Map<String, Object> expiredInlineMarkup = createRenewOnlyInlineKeyboard();
                editMessageText(webClient, chatId, messageId, expiredText, expiredInlineMarkup);
            } catch (Exception e) {
                log.debug("Auto-expire message {} for chatId {} skipped: {}", messageId, chatId, e.getMessage());
            }
        }, seconds, TimeUnit.SECONDS);
    }

    private String buildStartContactRequestMessage(String firstName) {
        String safeName = escapeHtml(firstName);
        return "🇺🇿\n" +
                "Salom " + safeName + " 👋\n" +
                "<b>@PomodoroUzBot</b>'ning rasmiy botiga xush kelibsiz\n\n" +
                "⬇ Kontaktingizni yuboring (tugmani bosib)\n\n" +
                "🇺🇸\n" +
                "Hi " + safeName + " 👋\n" +
                "Welcome to <b>@PomodoroUzBot</b>'s official bot\n\n" +
                "⬇ Send your contact (by clicking button)";
    }

    private String buildOtpMessage(String code, int remainingSeconds, boolean isNew) {
        if (isNew || remainingSeconds >= 55) {
            return "🔑 <b>Bir martalik kirish kodi / One-time login code:</b>\n" +
                   "<code>" + code + "</code>\n\n" +
                   "⏱ <b>Amal qilish muddati / Valid for:</b> 1 daqiqa (60 soniya)\n\n" +
                   "👇 Saytga kirish uchun quyidagi <b>Login</b> tugmasini bosing:";
        } else {
            return "🔑 <b>Faol kirish kodingiz / Your active login code:</b>\n" +
                   "<code>" + code + "</code>\n\n" +
                   "⏱ <b>Qolgan vaqt / Time remaining:</b> " + remainingSeconds + " soniya\n\n" +
                   "👇 Saytga kirish uchun <b>Login</b> tugmasini bosing yoki <b>🔄 Yangilash</b> ni bosing:";
        }
    }

    private String buildAboutMessage() {
        String cleanUrl = frontendUrl != null ? frontendUrl.trim() : "https://pomodoro.uz";
        return "🍅 <b>Pomodoro.uz haqida</b>\n\n" +
                "<b>Pomodoro.uz</b> — bu vaqtni to'g'ri boshqarish, diqqatni jamlash va mahsuldorlikni oshirish uchun mo'ljallangan platformadir.\n\n" +
                "🎯 <b>Pomodoro texnikasi qanday ishlaydi?</b>\n" +
                "1️⃣ <b>Vazifani tanlang</b> — Bajarilishi kerak bo'lgan ishni belgilang.\n" +
                "2️⃣ <b>Taymerni yoqing</b> — 25 daqiqa davomida diqqatni chalg'itmasdan faqat shu ish ustida ishlang.\n" +
                "3️⃣ <b>Tanaffus qiling</b> — 5 daqiqa to'liq dam oling va tetiklashib oling ☕️\n" +
                "4️⃣ <b>Takrorlang</b> — Har 4 ta Pomodorodan so'ng uzoqroq (15-30 daqiqa) tanaffus qiling.\n\n" +
                "🤖 <b>Mavjud bot buyruqlari:</b>\n" +
                "• /stats — Statistikalar va hisobotlar menyusi\n" +
                "• /taskstats — Vazifalar bo'yicha vaqt taqsimoti va progress-bar\n" +
                "• /daily — Bugungi bajarilgan pomodorolar\n" +
                "• /weekly — Haftalik analitika\n" +
                "• /monthly — Oylik ko'rsatkichlar\n" +
                "• /summary — Umumiy natijalar (All-time)\n" +
                "• /login — Saytga bir marta bosish bilan kirish kodi\n" +
                "• /about — Loyiha va foydalanish haqida ma'lumot\n\n" +
                "🌐 <b>Veb-sayt:</b> <a href=\"" + cleanUrl + "\">pomodoro.uz</a>";
    }

    private Map<String, Object> createAboutInlineKeyboard() {
        String cleanUrl = frontendUrl != null ? frontendUrl.trim() : "https://pomodoro.uz";
        return Map.of(
                "inline_keyboard", List.of(
                        List.of(
                                Map.of("text", "🌐 Saytga o'tish", "url", cleanUrl),
                                Map.of("text", "📊 Hisobotlar", "callback_data", "stats_daily_0")
                        )
                )
        );
    }

    private String buildStatsMessageForPeriod(User user, String period, int offset) {
        if (user == null) return "❌ Foydalanuvchi ma'lumotlari topilmadi.";
        return switch (period) {
            case "weekly" -> buildWeeklyStatsText(user, offset);
            case "monthly" -> buildMonthlyStatsText(user, offset);
            case "summary" -> buildSummaryStatsText(user);
            default -> buildDailyStatsText(user, offset);
        };
    }

    private String formatDuration(int minutes) {
        if (minutes <= 0) return "0 min";
        int hrs = minutes / 60;
        int mins = minutes % 60;
        if (hrs == 0) {
            return mins + " min";
        } else if (mins == 0) {
            return hrs + " soat";
        } else {
            return hrs + " soat " + mins + " min";
        }
    }

    private String getUzbekMonthName(int month) {
        return switch (month) {
            case 1 -> "Yanvar";
            case 2 -> "Fevral";
            case 3 -> "Mart";
            case 4 -> "Aprel";
            case 5 -> "May";
            case 6 -> "Iyun";
            case 7 -> "Iyul";
            case 8 -> "Avgust";
            case 9 -> "Sentabr";
            case 10 -> "Oktabr";
            case 11 -> "Noyabr";
            case 12 -> "Dekabr";
            default -> "";
        };
    }

    private String getUzbekDayName(DayOfWeek dayOfWeek) {
        return switch (dayOfWeek) {
            case MONDAY -> "Dushanba";
            case TUESDAY -> "Seshanba";
            case WEDNESDAY -> "Chorshanba";
            case THURSDAY -> "Payshanba";
            case FRIDAY -> "Juma";
            case SATURDAY -> "Shanba";
            case SUNDAY -> "Yakshanba";
        };
    }

    private String getUzbekDayShort(DayOfWeek dayOfWeek) {
        return switch (dayOfWeek) {
            case MONDAY -> "Dush";
            case TUESDAY -> "Sesh";
            case WEDNESDAY -> "Chor";
            case THURSDAY -> "Pay";
            case FRIDAY -> "Jum";
            case SATURDAY -> "Shan";
            case SUNDAY -> "Yak";
        };
    }

    private String buildDailyStatsText(User user, int offset) {
        UUID userId = user.getId();
        StatsResponse stats = statsService.getDaily(userId, offset).block(Duration.ofSeconds(5));
        LocalDate date = LocalDate.now(ZoneId.of("Asia/Tashkent")).plusDays(offset);
        String dateStr = date.format(DateTimeFormatter.ofPattern("dd.MM.yyyy"));

        String titleDate;
        if (offset == 0) {
            titleDate = "Bugun (" + date.getDayOfMonth() + "-" + getUzbekMonthName(date.getMonthValue()).toLowerCase() + ", " + date.getYear() + ")";
        } else if (offset == -1) {
            titleDate = "Kecha (" + date.getDayOfMonth() + "-" + getUzbekMonthName(date.getMonthValue()).toLowerCase() + ", " + date.getYear() + ")";
        } else {
            titleDate = dateStr;
        }

        if (stats == null) {
            return "📊 <b>" + titleDate + " hisoboti</b>\n\n<i>Ma'lumotlarni yuklab bo'lmadi.</i>";
        }

        StringBuilder sb = new StringBuilder();
        sb.append("📊 <b>").append(titleDate).append(" hisoboti</b>\n\n");
        sb.append("🍅 Bajarilgan Pomodorolar: <b>").append(stats.completedSessions()).append(" / ").append(stats.totalSessions()).append(" ta</b>");
        if (stats.totalSessions() > 0) {
            sb.append(String.format(" (<b>%.1f%%</b>)", stats.completionRate()));
        }
        sb.append("\n");
        sb.append("⏱ Jami diqqat vaqti: <b>").append(formatDuration(stats.totalMinutes())).append("</b>\n");
        sb.append("🔥 Hozirgi zanjir (Streak): <b>").append(stats.currentStreak()).append(" kun</b> (Rekord: ").append(stats.bestStreak()).append(" kun)\n");

        if (stats.taskBreakdown() != null && !stats.taskBreakdown().isEmpty()) {
            sb.append("\n🏷 <b>Loyihalar bo'yicha taqsimot:</b>\n");
            for (StatsResponse.TaskBreakdownEntry t : stats.taskBreakdown()) {
                sb.append("• <b>").append(escapeHtml(t.label())).append("</b>: ")
                  .append(formatDuration(t.minutes()))
                  .append(String.format(" (%.1f%%)\n", t.percentage()));
            }
        } else if (stats.completedSessions() == 0) {
            sb.append("\n<i>Ushbu kunda hali bajarilgan pomodoro sessiyalari yo'q. Bugun birinchi sessiyangizni boshlang! 🚀</i>");
        }

        return sb.toString();
    }

    private String buildWeeklyStatsText(User user, int offset) {
        UUID userId = user.getId();
        StatsResponse stats = statsService.getWeekly(userId, offset).block(Duration.ofSeconds(5));
        LocalDate target = LocalDate.now(ZoneId.of("Asia/Tashkent")).plusWeeks(offset);
        LocalDate startOfWeek = target.with(DayOfWeek.MONDAY);
        LocalDate endOfWeek = target.with(DayOfWeek.SUNDAY);

        String rangeStr = startOfWeek.format(DateTimeFormatter.ofPattern("dd.MM")) + " — " + endOfWeek.format(DateTimeFormatter.ofPattern("dd.MM.yyyy"));

        if (stats == null) {
            return "🗓 <b>Haftalik hisobot (" + rangeStr + ")</b>\n\n<i>Ma'lumotlarni yuklab bo'lmadi.</i>";
        }

        StatsResponse.DailyEntry maxDay = null;
        if (stats.entries() != null) {
            for (StatsResponse.DailyEntry entry : stats.entries()) {
                if (entry.minutes() > 0) {
                    if (maxDay == null || entry.minutes() > maxDay.minutes()) {
                        maxDay = entry;
                    }
                }
            }
        }

        StringBuilder sb = new StringBuilder();
        sb.append("🗓 <b>Haftalik hisobot</b> (").append(rangeStr).append(")\n\n");
        sb.append("🍅 Bajarilgan Pomodorolar: <b>").append(stats.completedSessions()).append(" ta</b>\n");
        sb.append("⏱ Jami diqqat vaqti: <b>").append(formatDuration(stats.totalMinutes())).append("</b>\n");

        if (maxDay != null) {
            String dayName = getUzbekDayName(maxDay.date().getDayOfWeek());
            sb.append("⭐ Eng mahsuldor kun: <b>").append(dayName).append(" (").append(formatDuration(maxDay.minutes())).append(")</b>\n");
        }
        sb.append("🔥 Hozirgi zanjir (Streak): <b>").append(stats.currentStreak()).append(" kun</b> (Rekord: ").append(stats.bestStreak()).append(" kun)\n\n");

        sb.append("📅 <b>Kunlar bo'yicha:</b>\n");
        if (stats.entries() != null && !stats.entries().isEmpty()) {
            for (StatsResponse.DailyEntry entry : stats.entries()) {
                String dayShort = getUzbekDayShort(entry.date().getDayOfWeek());
                String dateShort = entry.date().format(DateTimeFormatter.ofPattern("dd.MM"));
                sb.append("• <b>").append(dayShort).append("</b> (").append(dateShort).append("): ");
                if (entry.minutes() > 0) {
                    sb.append(formatDuration(entry.minutes())).append(" (").append(entry.count()).append(" ta)\n");
                } else {
                    sb.append("0 min\n");
                }
            }
        }

        return sb.toString();
    }

    private String buildMonthlyStatsText(User user, int offset) {
        UUID userId = user.getId();
        StatsResponse stats = statsService.getMonthly(userId, offset).block(Duration.ofSeconds(5));
        LocalDate target = LocalDate.now(ZoneId.of("Asia/Tashkent")).plusMonths(offset);
        String monthTitle = getUzbekMonthName(target.getMonthValue()) + " " + target.getYear();

        if (stats == null) {
            return "📈 <b>Oylik hisobot (" + monthTitle + ")</b>\n\n<i>Ma'lumotlarni yuklab bo'lmadi.</i>";
        }

        int totalDaysInMonth = target.lengthOfMonth();
        int avgMinutes = stats.totalMinutes() / totalDaysInMonth;

        StringBuilder sb = new StringBuilder();
        sb.append("📈 <b>Oylik hisobot</b> (").append(monthTitle).append(")\n\n");
        sb.append("🍅 Bajarilgan Pomodorolar: <b>").append(stats.completedSessions()).append(" ta</b>\n");
        sb.append("⏱ Jami diqqat vaqti: <b>").append(formatDuration(stats.totalMinutes())).append("</b>\n");
        sb.append("📊 Kunlik o'rtacha ish vaqti: <b>").append(formatDuration(avgMinutes)).append("</b>\n");
        sb.append("🔥 Hozirgi zanjir (Streak): <b>").append(stats.currentStreak()).append(" kun</b> (Rekord: ").append(stats.bestStreak()).append(" kun)\n");

        if (stats.taskBreakdown() != null && !stats.taskBreakdown().isEmpty()) {
            sb.append("\n🏷 <b>Loyihalar bo'yicha taqsimot:</b>\n");
            for (StatsResponse.TaskBreakdownEntry t : stats.taskBreakdown()) {
                sb.append("• <b>").append(escapeHtml(t.label())).append("</b>: ")
                  .append(formatDuration(t.minutes()))
                  .append(String.format(" (%.1f%%)\n", t.percentage()));
            }
        }

        return sb.toString();
    }

    private String buildSummaryStatsText(User user) {
        UUID userId = user.getId();
        Map<String, Object> summary = statsService.getSummary(userId).block(Duration.ofSeconds(5));

        if (summary == null) {
            return "📜 <b>Umumiy hisobot (All-Time)</b>\n\n<i>Ma'lumotlarni yuklab bo'lmadi.</i>";
        }

        int completedSessions = ((Number) summary.getOrDefault("completedSessions", 0)).intValue();
        int totalMinutes = ((Number) summary.getOrDefault("totalMinutes", 0)).intValue();
        int streak = ((Number) summary.getOrDefault("streak", 0)).intValue();
        int bestStreak = ((Number) summary.getOrDefault("bestStreak", 0)).intValue();

        StringBuilder sb = new StringBuilder();
        sb.append("📜 <b>Umumiy hisobot (All-Time)</b>\n\n");
        sb.append("🍅 Jami bajarilgan Pomodorolar: <b>").append(completedSessions).append(" ta</b>\n");
        sb.append("⏱ Jami diqqat vaqti: <b>").append(formatDuration(totalMinutes)).append("</b>\n");
        sb.append("🔥 Hozirgi zanjir (Streak): <b>").append(streak).append(" kun</b>\n");
        sb.append("🏆 Eng yaxshi rekord: <b>").append(bestStreak).append(" kun</b>\n");

        return sb.toString();
    }

    private Map<String, Object> createStatsInlineKeyboard(String activePeriod, int offset) {
        String cleanUrl = frontendUrl != null ? frontendUrl.trim() : "https://pomodoro.uz";

        String dailyLabel = (activePeriod.equals("daily") && offset == 0 ? "✅ " : "") + "📅 Bugun";
        String weeklyLabel = (activePeriod.equals("weekly") && offset == 0 ? "✅ " : "") + "🗓 Shu Hafta";
        String monthlyLabel = (activePeriod.equals("monthly") && offset == 0 ? "✅ " : "") + "📈 Shu Oy";
        String summaryLabel = (activePeriod.equals("summary") ? "✅ " : "") + "📜 Umumiy";

        List<Map<String, Object>> row1 = List.of(
            Map.of("text", dailyLabel, "callback_data", "stats_daily_0"),
            Map.of("text", weeklyLabel, "callback_data", "stats_weekly_0")
        );

        List<Map<String, Object>> row2 = List.of(
            Map.of("text", monthlyLabel, "callback_data", "stats_monthly_0"),
            Map.of("text", summaryLabel, "callback_data", "stats_summary")
        );

        List<List<Map<String, Object>>> keyboardRows = new ArrayList<>();
        keyboardRows.add(row1);
        keyboardRows.add(row2);

        // Row 3: Pagination if applicable
        if ("daily".equals(activePeriod)) {
            List<Map<String, Object>> navRow = new ArrayList<>();
            navRow.add(Map.of("text", "◀️ O'tgan kun", "callback_data", "stats_daily_" + (offset - 1)));
            if (offset < 0) {
                navRow.add(Map.of("text", "Keyingi kun ▶️", "callback_data", "stats_daily_" + (offset + 1)));
            }
            keyboardRows.add(navRow);
        } else if ("weekly".equals(activePeriod)) {
            List<Map<String, Object>> navRow = new ArrayList<>();
            navRow.add(Map.of("text", "◀️ O'tgan hafta", "callback_data", "stats_weekly_" + (offset - 1)));
            if (offset < 0) {
                navRow.add(Map.of("text", "Keyingi hafta ▶️", "callback_data", "stats_weekly_" + (offset + 1)));
            }
            keyboardRows.add(navRow);
        } else if ("monthly".equals(activePeriod)) {
            List<Map<String, Object>> navRow = new ArrayList<>();
            navRow.add(Map.of("text", "◀️ O'tgan oy", "callback_data", "stats_monthly_" + (offset - 1)));
            if (offset < 0) {
                navRow.add(Map.of("text", "Keyingi oy ▶️", "callback_data", "stats_monthly_" + (offset + 1)));
            }
            keyboardRows.add(navRow);
        }

        // Row 4: Web link
        keyboardRows.add(List.of(
            Map.of("text", "🌐 Saytga o'tish", "url", cleanUrl)
        ));

        return Map.of("inline_keyboard", keyboardRows);
    }

    private Map<String, Object> createContactReplyKeyboard() {
        return Map.of(
                "keyboard", List.of(
                        List.of(
                                Map.of("text", "📱 Kontaktingizni yuboring / Send contact", "request_contact", true)
                        )
                ),
                "resize_keyboard", true,
                "one_time_keyboard", true
        );
    }

    private Map<String, Object> createMainReplyKeyboard() {
        List<Map<String, Object>> row1 = List.of(
            Map.of("text", "📊 Hisobotlar"),
            Map.of("text", "📋 Vazifalar hisoboti")
        );
        List<Map<String, Object>> row2 = List.of(
            Map.of("text", "ℹ️ Loyiha haqida"),
            Map.of("text", "💡 Pomodoro Nima?")
        );

        return Map.of(
            "keyboard", List.of(row1, row2),
            "resize_keyboard", true,
            "persistent", true
        );
    }

    private String buildPomodoroExplanationMessage() {
        String cleanUrl = frontendUrl != null ? frontendUrl.trim() : "https://pomodoro.uz";
        return "💡 <b>Pomodoro Texnikasi Nima?</b>\n\n" +
                "<b>Pomodoro Texnikasi</b> — bu 1980-yillarda Franchesko Chirillo tomonidan yaratilgan, diqqatni maksimal darajada bir joyga jamlash va vaqtni unumli boshqarish usulidir.\n\n" +
                "⚡️ <b>Qanday ishlaydi?</b>\n" +
                "1️⃣ <b>Vazifa tanlang:</b> Bajarilishi kerak bo'lgan ishni belgilang.\n" +
                "2️⃣ <b>25 minut diqqat:</b> Taymerni yoqing va 25 daqiqa davomida chalg'imay ishlang.\n" +
                "3️⃣ <b>5 minut tanaffus:</b> 25 daqiqa tugagach, 5 daqiqa to'liq dam oling ☕️\n" +
                "4️⃣ <b>4 ta seansdan so'ng:</b> Har 4 ta Pomodorodan keyin 15-30 daqiqalik uzun tanaffus qiling.\n\n" +
                "🚀 <b>Avzalliklari:</b> Miya charchashining oldini oladi va ish samaradorligini 2x oshiradi.\n\n" +
                "🌐 <b>Onlayn taymer:</b> <a href=\"" + cleanUrl + "\">pomodoro.uz</a>";
    }

    private Map<String, Object> createInlineKeyboard(String code) {
        String cleanUrl = frontendUrl != null ? frontendUrl.trim() : "https://pomodoro.uz";
        while (cleanUrl.startsWith("https://https://")) {
            cleanUrl = "https://" + cleanUrl.substring(16);
        }
        while (cleanUrl.startsWith("http://http://")) {
            cleanUrl = "http://" + cleanUrl.substring(14);
        }
        if (cleanUrl.endsWith("/")) {
            cleanUrl = cleanUrl.substring(0, cleanUrl.length() - 1);
        }
        String loginUrl = cleanUrl + "/#login?otp=" + code;

        return Map.of(
                "inline_keyboard", List.of(
                        List.of(
                                Map.of("text", "Login", "url", loginUrl),
                                Map.of("text", "🔄 Yangilash / Renew", "callback_data", "renew_otp")
                        )
                )
        );
    }

    private Map<String, Object> createRenewOnlyInlineKeyboard() {
        return Map.of(
                "inline_keyboard", List.of(
                        List.of(
                                Map.of("text", "🔄 Yangilash / Renew", "callback_data", "renew_otp")
                        )
                )
        );
    }

    @SuppressWarnings("unchecked")
    private Long sendMessage(WebClient webClient, Long chatId, String text, Map<String, Object> replyMarkup) {
        try {
            Map<String, Object> body = new java.util.HashMap<>();
            body.put("chat_id", chatId);
            body.put("text", text);
            body.put("parse_mode", "HTML");
            if (replyMarkup != null) {
                body.put("reply_markup", replyMarkup);
            }

            Map<String, Object> resp = webClient.post()
                    .uri("/sendMessage")
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block(Duration.ofSeconds(5));

            if (resp != null && Boolean.TRUE.equals(resp.get("ok"))) {
                Map<String, Object> result = (Map<String, Object>) resp.get("result");
                if (result != null && result.containsKey("message_id")) {
                    return ((Number) result.get("message_id")).longValue();
                }
            } else {
                log.warn("Telegram sendMessage API error response for chatId {}: {}", chatId, resp);
            }
        } catch (Exception e) {
            log.error("Failed to send Telegram message to chatId {}: {}", chatId, e.getMessage());
        }
        return null;
    }

    public Mono<Boolean> sendBugReportToAdmin(String userName, String userPhone, Long telegramId, String category, String description, String pageUrl, String userAgent) {
        if (botToken == null || botToken.isBlank()) {
            log.warn("Telegram bot token is not configured. Cannot send bug report to admin.");
            return Mono.just(false);
        }

        Long adminChatId = 7949632456L;
        WebClient webClient = webClientBuilder.baseUrl("https://api.telegram.org/bot" + botToken.trim()).build();

        String formattedText = "🚨 <b>YANGI XATOLIK XABARI (Bug Report)</b>\n\n" +
                "👤 <b>Foydalanuvchi:</b> " + escapeHtml(userName != null ? userName : "Noma'lum") + "\n" +
                "📱 <b>Telefon:</b> " + escapeHtml(userPhone != null ? userPhone : "Kiritilmagan") + "\n" +
                "🆔 <b>Telegram ID:</b> <code>" + (telegramId != null ? telegramId : "Noma'lum") + "</code>\n\n" +
                "🏷 <b>Kategoriya:</b> " + escapeHtml(category != null ? category : "Boshqa") + "\n" +
                "💬 <b>Xato tavsifi:</b>\n<i>" + escapeHtml(description != null ? description : "Tavsif berilmagan") + "</i>\n\n" +
                "🌐 <b>Sahifa:</b> " + escapeHtml(pageUrl != null ? pageUrl : "-") + "\n" +
                "💻 <b>Qurilma/Brauzer:</b> " + escapeHtml(userAgent != null ? userAgent : "-");

        Map<String, Object> body = new java.util.HashMap<>();
        body.put("chat_id", adminChatId);
        body.put("text", formattedText);
        body.put("parse_mode", "HTML");

        return webClient.post()
                .uri("/sendMessage")
                .bodyValue(body)
                .retrieve()
                .bodyToMono(Map.class)
                .map(resp -> resp != null && Boolean.TRUE.equals(resp.get("ok")))
                .onErrorResume(e -> {
                    log.error("Failed to send bug report to admin Telegram chatId {}: {}", adminChatId, e.getMessage());
                    return Mono.just(false);
                });
    }

    private void editMessageText(WebClient webClient, Long chatId, Long messageId, String text, Map<String, Object> replyMarkup) {
        try {
            Map<String, Object> body = new java.util.HashMap<>();
            body.put("chat_id", chatId);
            body.put("message_id", messageId);
            body.put("text", text);
            body.put("parse_mode", "HTML");
            if (replyMarkup != null) {
                body.put("reply_markup", replyMarkup);
            }

            webClient.post()
                    .uri("/editMessageText")
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block(Duration.ofSeconds(5));
        } catch (Exception e) {
            log.error("Failed to edit Telegram message chatId {} msgId {}: {}", chatId, messageId, e.getMessage());
        }
    }

    private void answerCallbackQuery(WebClient webClient, String callbackQueryId, String notificationText, boolean showAlert) {
        try {
            Map<String, Object> body = new java.util.HashMap<>();
            body.put("callback_query_id", callbackQueryId);
            body.put("text", notificationText);
            body.put("show_alert", showAlert);

            webClient.post()
                    .uri("/answerCallbackQuery")
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block(Duration.ofSeconds(5));
        } catch (Exception e) {
            log.error("Failed to answer callback query {}: {}", callbackQueryId, e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private String getUserProfilePhotoUrl(WebClient webClient, Long telegramId) {
        if (telegramId == null || botToken == null || botToken.isBlank()) return null;
        try {
            Map<String, Object> resp = webClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/getUserProfilePhotos")
                            .queryParam("user_id", telegramId)
                            .queryParam("limit", 1)
                            .build())
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block(Duration.ofSeconds(4));

            if (resp != null && Boolean.TRUE.equals(resp.get("ok"))) {
                Map<String, Object> result = (Map<String, Object>) resp.get("result");
                if (result != null && result.containsKey("photos")) {
                    List<List<Map<String, Object>>> photos = (List<List<Map<String, Object>>>) result.get("photos");
                    if (photos != null && !photos.isEmpty() && !photos.get(0).isEmpty()) {
                        List<Map<String, Object>> sizes = photos.get(0);
                        Map<String, Object> photoSize = sizes.get(sizes.size() - 1); // Get largest photo size
                        String fileId = (String) photoSize.get("file_id");

                        Map<String, Object> fileResp = webClient.get()
                                .uri(uriBuilder -> uriBuilder
                                        .path("/getFile")
                                        .queryParam("file_id", fileId)
                                        .build())
                                .retrieve()
                                .bodyToMono(Map.class)
                                .block(Duration.ofSeconds(4));

                        if (fileResp != null && Boolean.TRUE.equals(fileResp.get("ok"))) {
                            Map<String, Object> fileResult = (Map<String, Object>) fileResp.get("result");
                            if (fileResult != null && fileResult.containsKey("file_path")) {
                                String filePath = (String) fileResult.get("file_path");
                                String photoUrl = "https://api.telegram.org/file/bot" + botToken.trim() + "/" + filePath;
                                log.info("Successfully fetched Telegram profile photo URL for telegramId {}: {}", telegramId, photoUrl);
                                return photoUrl;
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.debug("Could not fetch profile photo for telegramId {}: {}", telegramId, e.getMessage());
        }
        return null;
    }

    private String buildTaskStatsMessageForPeriod(User user, String period, int offset) {
        UUID userId = user.getId();
        StatsResponse stats;
        String rangeTitle;

        if ("daily".equals(period)) {
            stats = statsService.getDaily(userId, offset).block(Duration.ofSeconds(5));
            LocalDate date = LocalDate.now(ZoneId.of("Asia/Tashkent")).plusDays(offset);
            rangeTitle = "Bugun (" + date.format(DateTimeFormatter.ofPattern("dd.MM.yyyy")) + ")";
        } else if ("monthly".equals(period)) {
            stats = statsService.getMonthly(userId, offset).block(Duration.ofSeconds(5));
            LocalDate date = LocalDate.now(ZoneId.of("Asia/Tashkent")).plusMonths(offset);
            rangeTitle = getUzbekMonthName(date.getMonthValue()) + " " + date.getYear();
        } else if ("summary".equals(period)) {
            stats = statsService.getSummaryStats(userId).block(Duration.ofSeconds(5));
            rangeTitle = "Umumiy (Barcha vaqtlar)";
        } else { // weekly
            stats = statsService.getWeekly(userId, offset).block(Duration.ofSeconds(5));
            LocalDate now = LocalDate.now(ZoneId.of("Asia/Tashkent")).plusWeeks(offset);
            LocalDate monday = now.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            LocalDate sunday = monday.plusDays(6);
            rangeTitle = monday.format(DateTimeFormatter.ofPattern("dd.MM")) + " — " + sunday.format(DateTimeFormatter.ofPattern("dd.MM.yyyy"));
        }

        if (stats == null) {
            return "📋 <b>Vazifalar bo'yicha taqsimot (" + rangeTitle + ")</b>\n\n<i>Ma'lumotlarni yuklab bo'lmadi.</i>";
        }

        List<StatsResponse.TaskBreakdownEntry> breakdown = stats.taskBreakdown();
        StringBuilder sb = new StringBuilder();
        sb.append("📋 <b>Vazifalar bo'yicha vaqt taqsimoti</b>\n");
        sb.append("🗓 <b>Davr:</b> ").append(rangeTitle).append("\n\n");
        sb.append("⏱ Jami diqqat vaqti: <b>").append(formatDuration(stats.totalMinutes())).append("</b> (").append(stats.completedSessions()).append(" ta pomodoro)\n\n");

        if (breakdown == null || breakdown.isEmpty()) {
            sb.append("<i>Ushbu davrda hali bajarilgan vazifalar mavjud emas. Saytda yoki taymerda vazifa biriktirib Pomodoro bajaring!</i>");
            return sb.toString();
        }

        sb.append("📊 <b>Taqsimot ro'yxati:</b>\n\n");
        for (StatsResponse.TaskBreakdownEntry entry : breakdown) {
            String label = escapeHtml(entry.label());
            int minutes = entry.minutes();
            int count = entry.count();
            double pct = entry.percentage();
            String progressBar = generateProgressBar(pct);

            sb.append("🔹 <b>").append(label).append("</b>\n");
            sb.append("   • ").append(formatDuration(minutes)).append(" (").append(count).append(" ta pomodoro)\n");
            sb.append("   • <code>").append(progressBar).append("</code> <b>").append(String.format(Locale.US, "%.1f", pct)).append("%</b>\n\n");
        }

        return sb.toString();
    }

    private String generateProgressBar(double percentage) {
        int totalBlocks = 10;
        int filledBlocks = (int) Math.round((percentage / 100.0) * totalBlocks);
        filledBlocks = Math.max(0, Math.min(totalBlocks, filledBlocks));
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < filledBlocks; i++) {
            sb.append("█");
        }
        for (int i = filledBlocks; i < totalBlocks; i++) {
            sb.append("░");
        }
        return sb.toString();
    }

    private Map<String, Object> createTaskStatsInlineKeyboard(String activePeriod, int offset) {
        String cleanUrl = frontendUrl != null ? frontendUrl.trim() : "https://pomodoro.uz";

        String dailyLabel = (activePeriod.equals("daily") && offset == 0 ? "✅ " : "") + "📅 Bugun";
        String weeklyLabel = (activePeriod.equals("weekly") && offset == 0 ? "✅ " : "") + "🗓 Shu Hafta";
        String monthlyLabel = (activePeriod.equals("monthly") && offset == 0 ? "✅ " : "") + "📈 Shu Oy";
        String summaryLabel = (activePeriod.equals("summary") ? "✅ " : "") + "📜 Umumiy";

        List<Map<String, Object>> row1 = List.of(
            Map.of("text", dailyLabel, "callback_data", "taskstats_daily_0"),
            Map.of("text", weeklyLabel, "callback_data", "taskstats_weekly_0")
        );

        List<Map<String, Object>> row2 = List.of(
            Map.of("text", monthlyLabel, "callback_data", "taskstats_monthly_0"),
            Map.of("text", summaryLabel, "callback_data", "taskstats_summary")
        );

        List<List<Map<String, Object>>> keyboardRows = new ArrayList<>();
        keyboardRows.add(row1);
        keyboardRows.add(row2);

        if ("daily".equals(activePeriod)) {
            List<Map<String, Object>> navRow = new ArrayList<>();
            navRow.add(Map.of("text", "◀️ O'tgan kun", "callback_data", "taskstats_daily_" + (offset - 1)));
            if (offset < 0) {
                navRow.add(Map.of("text", "Keyingi kun ▶️", "callback_data", "taskstats_daily_" + (offset + 1)));
            }
            keyboardRows.add(navRow);
        } else if ("weekly".equals(activePeriod)) {
            List<Map<String, Object>> navRow = new ArrayList<>();
            navRow.add(Map.of("text", "◀️ O'tgan hafta", "callback_data", "taskstats_weekly_" + (offset - 1)));
            if (offset < 0) {
                navRow.add(Map.of("text", "Keyingi hafta ▶️", "callback_data", "taskstats_weekly_" + (offset + 1)));
            }
            keyboardRows.add(navRow);
        } else if ("monthly".equals(activePeriod)) {
            List<Map<String, Object>> navRow = new ArrayList<>();
            navRow.add(Map.of("text", "◀️ O'tgan oy", "callback_data", "taskstats_monthly_" + (offset - 1)));
            if (offset < 0) {
                navRow.add(Map.of("text", "Keyingi oy ▶️", "callback_data", "taskstats_monthly_" + (offset + 1)));
            }
            keyboardRows.add(navRow);
        }

        keyboardRows.add(List.of(
            Map.of("text", "🌐 Saytga o'tish", "url", cleanUrl)
        ));

        return Map.of("inline_keyboard", keyboardRows);
    }
}
