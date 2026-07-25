package uz.pomodoro.event;

import org.springframework.context.ApplicationEvent;
import uz.pomodoro.domain.session.PomodoroSession;

public class PomodoroCompletedEvent extends ApplicationEvent {

    private final PomodoroSession session;

    public PomodoroCompletedEvent(Object source, PomodoroSession session) {
        super(source);
        this.session = session;
    }

    public PomodoroSession getSession() {
        return session;
    }
}
