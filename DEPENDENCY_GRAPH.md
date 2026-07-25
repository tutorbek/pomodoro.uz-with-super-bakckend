# DEPENDENCY_GRAPH.md — Pomodoro.uz Backend

> Qaysi class qaysi classga bog'liq. Codex yangi fayl yozishdan oldin shu grafni ko'rsin.

---

## Layer dependency (yuqoridan pastga)

```
[Router] → [Handler] → [Service] → [Repository] → [DB/Redis]
                           ↓
                       [Event] → [Listener] → [Service, WebSocket]
```

---

## Handler bog'liqliklari

```
UserHandler
  └── UserService

SessionHandler
  └── SessionService
        ├── SessionRepository    (R2DBC → CockroachDB)
        └── ApplicationEventPublisher

StatsHandler
  └── StatsService
        ├── SessionRepository
        └── DailyStatsRepository (R2DBC → CockroachDB)

LeaderboardHandler
  └── LeaderboardService
        ├── ReactiveRedisTemplate
        ├── SessionRepository
        └── UserRepository
```

---

## Security bog'liqliklari

```
SecurityConfig
  ├── JwtAuthFilter
  │     └── JwtService
  └── OAuth2SuccessHandler
        ├── UserService
        │     └── UserRepository
        └── JwtService
```

---

## Event bog'liqliklari

```
SessionService
  └── ApplicationEventPublisher → PomodoroCompletedEvent

PomodoroEventListener  [@EventListener]
  ├── StatsService
  ├── LeaderboardService
  └── LeaderboardWebSocketHandler
        └── LeaderboardService
              └── Sinks.Many<String>  (reactive multicast)
```

---

## Scheduler bog'liqliklari

```
StatsScheduler
  ├── SessionRepository
  └── DailyStatsRepository
```

---

## Entity → Repository → Service xaritasi

| Entity | Repository | Ishlatiladigan Service |
|---|---|---|
| User | UserRepository | UserService, OAuth2SuccessHandler, LeaderboardService |
| PomodoroSession | SessionRepository | SessionService, StatsService, LeaderboardService, StatsScheduler |
| DailyStats | DailyStatsRepository | StatsService, StatsScheduler |

---

## Config bog'liqliklari

```
SecurityConfig
  ├── JwtAuthFilter
  └── OAuth2SuccessHandler

RedisConfig
  └── ReactiveRedisTemplate<String, String>  [LeaderboardService uchun]

WebSocketConfig
  └── LeaderboardWebSocketHandler

R2dbcConfig
  └── ConnectionFactory  [barcha Repository uchun]
```

---

## Circular dependency xavfi — EHTIYOT BO'L

```
❌ XAVFLI:
LeaderboardService → UserRepository  (OK)
UserService → LeaderboardService     (CIRCULAR bo'ladi — QILMA)

❌ XAVFLI:
PomodoroEventListener → SessionService  (CIRCULAR bo'ladi — QILMA)
SessionService → ApplicationEventPublisher  (OK, Spring built-in)

✅ TO'G'RI YO'L:
Event orqali bog'la, to'g'ridan-to'g'ri inject qilma
```

---

## Gradle dependency guruhlari

```
CORE:
  spring-boot-starter-webflux
  spring-boot-starter-security
  spring-boot-starter-oauth2-client
  spring-boot-starter-validation
  lombok

DATABASE:
  spring-boot-starter-data-r2dbc
  r2dbc-postgresql
  flyway-core

CACHE/REALTIME:
  spring-boot-starter-data-redis-reactive
  spring-boot-starter-cache
  spring-boot-starter-websocket

AUTH:
  jjwt-api:0.12.5
  jjwt-impl:0.12.5
  jjwt-jackson:0.12.5

TEST:
  spring-boot-starter-test
  reactor-test
  spring-security-test
```
