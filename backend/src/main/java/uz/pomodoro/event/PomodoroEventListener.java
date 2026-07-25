package uz.pomodoro.event;

import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import uz.pomodoro.domain.session.PomodoroSession;
import uz.pomodoro.domain.stats.StatsService;

@Component
@RequiredArgsConstructor
public class PomodoroEventListener {

    private final StatsService statsService;

    @Async
    @EventListener
    public void onPomodoroCompleted(PomodoroCompletedEvent event) {
        PomodoroSession session = event.getSession();

        statsService.incrementDailyStats(session.getUserId(), session.getDuration())
            .subscribe();
    }
}
