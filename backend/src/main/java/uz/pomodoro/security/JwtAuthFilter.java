package uz.pomodoro.security;

import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

import uz.pomodoro.domain.user.UserRepository;

import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class JwtAuthFilter implements WebFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;
    private final UserRepository userRepository;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String token = extractBearerToken(exchange);

        if (token == null || !jwtService.isValid(token)) {
            return chain.filter(exchange);
        }

        try {
            Claims claims = jwtService.extractClaims(token);
            String tokenType = claims.get("type", String.class);
            if (tokenType != null && !"ACCESS".equalsIgnoreCase(tokenType)) {
                return chain.filter(exchange);
            }

            UUID userId = UUID.fromString(claims.getSubject());
            String email = claims.get("email", String.class);
            String role = claims.get("role", String.class);
            if (role == null || role.isBlank()) {
                role = "ROLE_USER";
            }

            String finalRole = role;
            return userRepository.existsById(userId)
                .flatMap(exists -> {
                    if (!exists) {
                        // User was deleted from DB! Reject authentication.
                        return chain.filter(exchange);
                    }

                    UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                        userId,
                        token,
                        List.of(new SimpleGrantedAuthority(finalRole))
                    );
                    authentication.setDetails(email);

                    return chain.filter(exchange)
                        .contextWrite(ReactiveSecurityContextHolder.withSecurityContext(
                            Mono.just(new SecurityContextImpl(authentication))
                        ));
                });
        } catch (Exception e) {
            return chain.filter(exchange);
        }
    }

    private String extractBearerToken(ServerWebExchange exchange) {
        String authorization = exchange.getRequest()
            .getHeaders()
            .getFirst(HttpHeaders.AUTHORIZATION);

        if (authorization == null || !authorization.startsWith(BEARER_PREFIX)) {
            return null;
        }

        return authorization.substring(BEARER_PREFIX.length());
    }
}
