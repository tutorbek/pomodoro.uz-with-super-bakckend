package uz.pomodoro.router;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.function.server.RouterFunction;
import org.springframework.web.reactive.function.server.RouterFunctions;
import org.springframework.web.reactive.function.server.ServerResponse;
import uz.pomodoro.domain.ai.AiHandler;
import uz.pomodoro.domain.session.SessionHandler;
import uz.pomodoro.domain.stats.StatsHandler;
import uz.pomodoro.domain.user.UserHandler;

import java.net.URI;

import uz.pomodoro.domain.task.TaskHandler;

@Configuration
public class AppRouter {

    @Bean
    public RouterFunction<ServerResponse> routes(
        UserHandler userHandler,
        SessionHandler sessionHandler,
        StatsHandler statsHandler,
        AiHandler aiHandler,
        TaskHandler taskHandler
    ) {
        return RouterFunctions.route()
            .path("/auth", auth -> auth
                .POST("/telegram-widget", userHandler::handleTelegramWidgetLogin)
                .POST("/telegram-tma", userHandler::handleTelegramTmaLogin)
                .POST("/telegram-code", userHandler::handleTelegramCodeLogin)
                .GET("/me", userHandler::getCurrentUser)
                .PUT("/me", userHandler::updateCurrentUser)
                .POST("/logout", userHandler::logout)
                .DELETE("/me", userHandler::deleteCurrentUser)
            )
            .path("/api/feedback", feedback -> feedback
                .POST("/bug-report", userHandler::submitBugReport)
                .POST("/bug-report/", userHandler::submitBugReport)
            )
            .path("/api/sessions", sessions -> sessions
                .POST("", sessionHandler::startSession)
                .POST("/", sessionHandler::startSession)
                .POST("/start", sessionHandler::startSession)
                .POST("/{id}/complete", sessionHandler::completeSession)
                .PUT("/{id}/complete", sessionHandler::completeSession)
                .GET("", sessionHandler::getSessions)
                .GET("/", sessionHandler::getSessions)
                .GET("/{id}", sessionHandler::getSession)
            )
            .path("/api/stats", stats -> stats
                .GET("/full", statsHandler::getFullStats)
                .GET("/daily", statsHandler::getDaily)
                .GET("/weekly", statsHandler::getWeekly)
                .GET("/monthly", statsHandler::getMonthly)
                .GET("/yearly", statsHandler::getYearly)
                .GET("/summary", statsHandler::getSummary)
            )
            .path("/api/ai", ai -> ai
                .GET("/insight", aiHandler::getInsight)
                .POST("/refresh", aiHandler::refreshInsight)
                .POST("/ask", aiHandler::askCoach)
            )
            .path("/api/tasks", tasks -> tasks
                .GET("", taskHandler::getTasks)
                .GET("/", taskHandler::getTasks)
                .POST("", taskHandler::createTask)
                .POST("/", taskHandler::createTask)
                .POST("/sync", taskHandler::syncTasks)
                .DELETE("/completed", taskHandler::clearCompleted)
                .DELETE("/all", taskHandler::clearAll)
                .PUT("/{id}", taskHandler::updateTask)
                .DELETE("/{id}", taskHandler::deleteTask)
            )
            .build();
    }
}
