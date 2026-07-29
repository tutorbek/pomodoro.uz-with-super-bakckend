package uz.pomodoro.security;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

import java.security.SecureRandom;

@Slf4j
@Service
public class TelegramAuthService {

    @Value("${telegram.bot.token}")
    private String botToken;

    private static final long RENEW_COOLDOWN_MS = 60000; // 60 seconds cooldown (1 daqiqa)

    private final Map<String, OtpData> otpStorage = new ConcurrentHashMap<>();
    private final Map<String, FailedAttempt> failedAttemptsStorage = new ConcurrentHashMap<>();
    private final Map<Long, Long> lastOtpGenerationTimeStorage = new ConcurrentHashMap<>();
    private final SecureRandom secureRandom = new SecureRandom();

    private static class FailedAttempt {
        int count;
        long lastAttemptTime;

        FailedAttempt(int count, long lastAttemptTime) {
            this.count = count;
            this.lastAttemptTime = lastAttemptTime;
        }
    }

    public static class OtpData {
        public final Long telegramId;
        public final String username;
        public final String firstName;
        public final String lastName;
        public final String phoneNumber;
        public final String languageCode;
        public final String photoUrl;
        public final long createdAt;

        public OtpData(Long telegramId, String username, String firstName, String lastName, String phoneNumber, String languageCode, String photoUrl) {
            this.telegramId = telegramId;
            this.username = username;
            this.firstName = firstName;
            this.lastName = lastName;
            this.phoneNumber = phoneNumber;
            this.languageCode = languageCode;
            this.photoUrl = photoUrl;
            this.createdAt = System.currentTimeMillis();
        }

        public OtpData(Long telegramId, String username, String firstName, String photoUrl) {
            this(telegramId, username, firstName, null, null, null, photoUrl);
        }
    }

    public record OtpResult(String code, boolean isNew) {}

    /**
     * Calculates remaining seconds before user is allowed to request/renew a new OTP code.
     */
    public int getRenewCooldownRemainingSeconds(Long telegramId) {
        if (telegramId == null) return 0;
        Long lastGen = lastOtpGenerationTimeStorage.get(telegramId);
        if (lastGen == null) return 0;
        long elapsed = System.currentTimeMillis() - lastGen;
        if (elapsed < RENEW_COOLDOWN_MS) {
            return (int) Math.ceil((RENEW_COOLDOWN_MS - elapsed) / 1000.0);
        }
        return 0;
    }

    private static final long OTP_TTL_MS = 60000L; // 1 minute (60 seconds)

    /**
     * Retrieves existing active code (<60s) or generates a new 6-digit OTP code for user, returning OtpResult.
     */
    public OtpResult getOrGenerateOtpResult(Long telegramId, String username, String firstName, String lastName, String phoneNumber, String languageCode, String photoUrl) {
        long now = System.currentTimeMillis();
        // Clean expired entries (> 60s)
        otpStorage.entrySet().removeIf(e -> now - e.getValue().createdAt > OTP_TTL_MS);

        // If telegramId already has an active code, return that existing code!
        for (Map.Entry<String, OtpData> entry : otpStorage.entrySet()) {
            OtpData data = entry.getValue();
            if (data.telegramId != null && data.telegramId.equals(telegramId) && (now - data.createdAt <= OTP_TTL_MS)) {
                log.info("Returning active existing OTP code {} for telegramId {}", entry.getKey(), telegramId);
                return new OtpResult(entry.getKey(), false);
            }
        }

        // Otherwise generate a new unique 6-digit code
        String code;
        do {
            code = String.format("%06d", secureRandom.nextInt(1000000));
        } while (otpStorage.containsKey(code));

        otpStorage.put(code, new OtpData(telegramId, username, firstName, lastName, phoneNumber, languageCode, photoUrl));
        if (telegramId != null) {
            lastOtpGenerationTimeStorage.put(telegramId, now);
        }
        log.info("Generated new 1-minute unique OTP code {} for telegramId {}", code, telegramId);
        return new OtpResult(code, true);
    }

    /**
     * Gets remaining seconds for active OTP of a telegram user, or 0 if expired/absent.
     */
    public int getRemainingSecondsForUser(Long telegramId) {
        if (telegramId == null) return 0;
        long now = System.currentTimeMillis();
        for (OtpData data : otpStorage.values()) {
            if (data.telegramId != null && data.telegramId.equals(telegramId)) {
                long elapsed = now - data.createdAt;
                if (elapsed < OTP_TTL_MS) {
                    return (int) Math.ceil((OTP_TTL_MS - elapsed) / 1000.0);
                }
            }
        }
        return 0;
    }

    public OtpResult getOrGenerateOtpResult(Long telegramId, String username, String firstName, String photoUrl) {
        return getOrGenerateOtpResult(telegramId, username, firstName, null, null, null, photoUrl);
    }

    /**
     * Retrieves existing active code (<60s) or generates a new 6-digit OTP code for user.
     */
    public String getOrGenerateOtpCode(Long telegramId, String username, String firstName, String photoUrl) {
        return getOrGenerateOtpResult(telegramId, username, firstName, photoUrl).code();
    }

    /**
     * Forces generation of a fresh 6-digit OTP code, removing any previous active code for user.
     */
    public String forceGenerateOtpCode(Long telegramId, String username, String firstName, String lastName, String phoneNumber, String languageCode, String photoUrl) {
        long now = System.currentTimeMillis();
        otpStorage.entrySet().removeIf(e -> e.getValue().telegramId != null && e.getValue().telegramId.equals(telegramId));

        String code;
        do {
            code = String.format("%06d", secureRandom.nextInt(1000000));
        } while (otpStorage.containsKey(code));

        otpStorage.put(code, new OtpData(telegramId, username, firstName, lastName, phoneNumber, languageCode, photoUrl));
        if (telegramId != null) {
            lastOtpGenerationTimeStorage.put(telegramId, now);
        }
        log.info("Force-generated fresh 1-minute unique OTP code {} for telegramId {}", code, telegramId);
        return code;
    }

    public String forceGenerateOtpCode(Long telegramId, String username, String firstName, String photoUrl) {
        return forceGenerateOtpCode(telegramId, username, firstName, null, null, null, photoUrl);
    }

    /**
     * Generates a 6-digit random OTP code valid for 1 minute (60s).
     */
    public String generateOtpCode(Long telegramId, String username, String firstName, String photoUrl) {
        return getOrGenerateOtpCode(telegramId, username, firstName, photoUrl);
    }

    /**
     * Validates and consumes the 6-digit OTP code if valid and fresh (< 60s).
     */
    public OtpData validateAndConsumeOtpCode(String code) {
        if (code == null || code.isBlank()) return null;
        String cleanCode = code.trim();

        // Rate limiting check
        long now = System.currentTimeMillis();
        failedAttemptsStorage.entrySet().removeIf(e -> now - e.getValue().lastAttemptTime > OTP_TTL_MS);

        OtpData data = otpStorage.get(cleanCode);
        if (data == null) {
            log.warn("OTP code {} not found or already consumed", cleanCode);
            return null;
        }

        if (now - data.createdAt > OTP_TTL_MS) {
            otpStorage.remove(cleanCode);
            log.warn("OTP code {} has expired", cleanCode);
            return null;
        }

        otpStorage.remove(cleanCode);
        log.info("OTP code {} successfully verified for telegramId {}", cleanCode, data.telegramId);
        return data;
    }

    /**
     * Validates data received from Telegram Login Widget.
     */
    public boolean validateWidgetData(Map<String, String> data) {
        if (data == null || !data.containsKey("hash") || !data.containsKey("id") || !data.containsKey("auth_date")) {
            log.warn("Telegram widget data missing required fields (hash, id, auth_date)");
            return false;
        }

        String receivedHash = data.get("hash");

        try {
            long authDate = Long.parseLong(data.get("auth_date"));
            long now = System.currentTimeMillis() / 1000;
            if (Math.abs(now - authDate) > 86400) {
                log.warn("Telegram widget auth data expired: authDate={}, now={}", authDate, now);
                return false;
            }
        } catch (NumberFormatException e) {
            log.warn("Invalid auth_date format: {}", data.get("auth_date"));
            return false;
        }

        String dataCheckString = data.entrySet().stream()
                .filter(entry -> !"hash".equals(entry.getKey()) && entry.getValue() != null && !entry.getValue().isBlank())
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> entry.getKey() + "=" + entry.getValue())
                .collect(Collectors.joining("\n"));

        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] secretKey = digest.digest(botToken.trim().getBytes(StandardCharsets.UTF_8));

            Mac hmacSha256 = Mac.getInstance("HmacSHA256");
            hmacSha256.init(new SecretKeySpec(secretKey, "HmacSHA256"));
            byte[] hmacBytes = hmacSha256.doFinal(dataCheckString.getBytes(StandardCharsets.UTF_8));

            String calculatedHash = bytesToHex(hmacBytes);
            boolean matches = calculatedHash.equalsIgnoreCase(receivedHash);

            if (!matches && dataCheckString.contains("/")) {
                String escapedDataCheckString = dataCheckString.replace("/", "\\/");
                byte[] escapedBytes = hmacSha256.doFinal(escapedDataCheckString.getBytes(StandardCharsets.UTF_8));
                String escapedCalculatedHash = bytesToHex(escapedBytes);
                if (escapedCalculatedHash.equalsIgnoreCase(receivedHash)) {
                    return true;
                }
            }

            return matches;
        } catch (Exception e) {
            log.error("Error validating Telegram Widget data", e);
            return false;
        }
    }

    /**
     * Validates raw initData string received from Telegram Mini App (TMA).
     */
    public boolean validateTmaInitData(String initData) {
        if (initData == null || initData.isBlank()) {
            return false;
        }

        Map<String, String> params = new HashMap<>();
        String receivedHash = null;

        String[] pairs = initData.split("&");
        for (String pair : pairs) {
            int idx = pair.indexOf("=");
            if (idx > 0) {
                String key = URLDecoder.decode(pair.substring(0, idx), StandardCharsets.UTF_8);
                String value = URLDecoder.decode(pair.substring(idx + 1), StandardCharsets.UTF_8);
                if ("hash".equals(key)) {
                    receivedHash = value;
                } else {
                    params.put(key, value);
                }
            }
        }

        if (receivedHash == null || receivedHash.isBlank()) {
            return false;
        }

        if (params.containsKey("auth_date")) {
            try {
                long authDate = Long.parseLong(params.get("auth_date"));
                long now = System.currentTimeMillis() / 1000;
                if (Math.abs(now - authDate) > 86400) {
                    log.warn("Telegram TMA initData expired, auth_date: {}", authDate);
                    return false;
                }
            } catch (NumberFormatException e) {
                return false;
            }
        }

        String dataCheckString = params.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> entry.getKey() + "=" + entry.getValue())
                .collect(Collectors.joining("\n"));

        try {
            Mac hmacWebAppData = Mac.getInstance("HmacSHA256");
            hmacWebAppData.init(new SecretKeySpec("WebAppData".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] secretKey = hmacWebAppData.doFinal(botToken.trim().getBytes(StandardCharsets.UTF_8));

            Mac hmacSha256 = Mac.getInstance("HmacSHA256");
            hmacSha256.init(new SecretKeySpec(secretKey, "HmacSHA256"));
            byte[] hmacBytes = hmacSha256.doFinal(dataCheckString.getBytes(StandardCharsets.UTF_8));

            String calculatedHash = bytesToHex(hmacBytes);
            return calculatedHash.equalsIgnoreCase(receivedHash);
        } catch (Exception e) {
            log.error("Error validating Telegram TMA initData", e);
            return false;
        }
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
