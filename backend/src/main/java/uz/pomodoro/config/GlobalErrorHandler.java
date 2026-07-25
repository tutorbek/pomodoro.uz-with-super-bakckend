package uz.pomodoro.config;

import org.springframework.boot.autoconfigure.web.ErrorProperties;
import org.springframework.boot.autoconfigure.web.WebProperties;
import org.springframework.boot.autoconfigure.web.reactive.error.DefaultErrorWebExceptionHandler;
import org.springframework.boot.web.error.ErrorAttributeOptions;
import org.springframework.boot.web.reactive.error.DefaultErrorAttributes;
import org.springframework.context.ApplicationContext;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.HandlerStrategies;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@Order(-2)
@Component
public class GlobalErrorHandler extends DefaultErrorWebExceptionHandler {

    public GlobalErrorHandler(ApplicationContext applicationContext) {
        super(
            new DefaultErrorAttributes(),
            new WebProperties.Resources(),
            new ErrorProperties(),
            applicationContext
        );
        setMessageWriters(HandlerStrategies.withDefaults().messageWriters());
        setMessageReaders(HandlerStrategies.withDefaults().messageReaders());
    }

    @Override
    protected Map<String, Object> getErrorAttributes(ServerRequest request, ErrorAttributeOptions options) {
        Throwable error = getError(request);
        Map<String, Object> attributes = new LinkedHashMap<>();

        if (error instanceof ResponseStatusException exception) {
            attributes.put("status", exception.getStatusCode().value());
            attributes.put("message", exception.getReason());
        } else {
            attributes.put("status", 500);
            attributes.put("message", "Internal server error");
        }

        attributes.put("timestamp", LocalDateTime.now());
        attributes.put("path", request.path());

        return attributes;
    }
}
