# AGENTS.md — Pomodoro.uz Backend

> Codex uchun: Bu faylni har doim birinchi o'qi. Loyiha haqida hamma narsa shu yerda.

---

## Loyiha bir gapda
Spring WebFlux asosida reactive backend. Google OAuth2 login, pomodoro sessiya boshqaruvi, kunlik/haftalik statistika, Redis leaderboard, WebSocket real-time push.

---

## Stack (o'zgartirma)
| Layer | Texnologiya |
|---|---|
| Web | Spring WebFlux (Netty, non-blocking) |
| Security | Spring Security Reactive + OAuth2 Google + JWT (jjwt 0.12.5) |
| Database | CockroachDB via Spring Data R2DBC |
| Cache | Redis via Spring Data Reactive Redis |
| Realtime | Spring WebSocket Reactive |
| Events | Spring Application Events |
| Scheduler | Spring Scheduler (@Scheduled) |
| Migration | Flyway |
| Lang | Java 21, Lombok |

---

## Package map
```
uz.pomodoro/
├── config/          → SecurityConfig, RedisConfig, R2dbcConfig, WebSocketConfig, SchedulerConfig
├── domain/
│   ├── user/        → User (entity), UserRepository, UserService, UserHandler
│   ├── session/     → PomodoroSession (entity), SessionRepository, SessionService, SessionHandler
│   ├── stats/       → DailyStats (entity), DailyStatsRepository, StatsService, StatsHandler
│   └── leaderboard/ → LeaderboardService, LeaderboardHandler
├── dto/             → SessionRequest, SessionResponse, StatsResponse, LeaderboardEntry
├── event/           → PomodoroCompletedEvent, PomodoroEventListener
├── router/          → AppRouter (barcha route shu yerda, Controller yo'q)
├── scheduler/       → StatsScheduler
├── security/        → JwtService, JwtAuthFilter, OAuth2SuccessHandler
└── websocket/       → LeaderboardWebSocketHandler
```

---

## Muhim qoidalar (BUZMA)
1. **Hech qachon `.block()` ishlatma** — hamma narsa Mono/Flux
2. **Controller yo'q** — faqat Handler + Router (functional style)
3. **Lombok majburiy** — @Data, @Builder, @RequiredArgsConstructor
4. **Package: uz.pomodoro** — o'zgartirma
5. **Java 21** — record, var, switch expression ishlatsa bo'ladi

---

## Database jadvallari
```
users              → id, email, name, avatar_url, provider, created_at, updated_at
pomodoro_sessions  → id, user_id(fk), started_at, ended_at, duration, completed, label, created_at
daily_stats        → id, user_id(fk), date, total_count, total_minutes  [UNIQUE: user_id+date]
```

---

## API route xaritasi
```
GET  /auth/me                    → UserHandler.getCurrentUser
POST /auth/logout                → UserHandler.logout

POST /api/sessions/start         → SessionHandler.startSession
PUT  /api/sessions/{id}/complete → SessionHandler.completeSession
GET  /api/sessions               → SessionHandler.getSessions  [?page=0&size=20]
GET  /api/sessions/{id}          → SessionHandler.getSession

GET  /api/stats/daily            → StatsHandler.getDaily
GET  /api/stats/weekly           → StatsHandler.getWeekly
GET  /api/stats/monthly          → StatsHandler.getMonthly
GET  /api/stats/summary          → StatsHandler.getSummary

GET  /api/leaderboard/daily      → LeaderboardHandler.getDaily   [top 10]
GET  /api/leaderboard/weekly     → LeaderboardHandler.getWeekly  [top 10]
GET  /api/leaderboard/alltime    → LeaderboardHandler.getAllTime  [top 20]

WS   /ws/leaderboard             → LeaderboardWebSocketHandler
```

Ruxsatsiz (permitAll): `/login/**`, `/ws/**`, `/api/leaderboard/**`
Qolgan hamma narsa: JWT token kerak

---

## Asosiy flow — pomodoro tugaganda nima bo'ladi
```
SessionService.completeSession()
  → session.completed = true, endedAt = now()
  → save()
  → ApplicationEventPublisher.publishEvent(PomodoroCompletedEvent)
       ↓
  PomodoroEventListener.onPomodoroCompleted()
    → StatsService.incrementDailyStats()     [daily_stats jadvali +1]
    → LeaderboardService.refreshUserScore()  [Redis ZSet yangilanadi]
    → LeaderboardWebSocketHandler.broadcastLeaderboard()  [WS push]
```

---

## Redis key'lar
```
leaderboard:daily:{YYYY-MM-DD}     TTL: 48 soat   (ZSet, score = pomodoro count)
leaderboard:weekly:{YYYY-MM-DD}    TTL: 14 kun    (haftaning dushanba sanasi)
leaderboard:alltime                TTL: yo'q
```

---

## Environment variables
```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
JWT_SECRET          (256-bit base64)
FRONTEND_URL        (default: http://localhost:5500)
```

---

## Fayl yaratish qoidalari
- Yangi feature → avval domain/ ichiga qo'y
- Yangi route → faqat AppRouter.java ga qo'sh
- Yangi jadval → yangi Flyway migration (V{n}__description.sql)
- Test fayl → src/test/java/uz/pomodoro/ ichiga, xuddi shu package tuzilmasi
