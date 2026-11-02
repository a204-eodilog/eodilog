package com.eodilog.global.config;

import com.eodilog.global.common.error.*;
import org.springframework.context.annotation.*;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.http.HttpMethod;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import java.util.List;
import com.eodilog.domain.auth.*;

@Configuration
@EnableConfigurationProperties({AuthProperties.class, CorsProperties.class})
public class SecurityConfig {
    private static final String[] SWAGGER_PATHS={"/swagger-ui.html","/swagger-ui/**","/v3/api-docs/**"};
    @Bean SecurityFilterChain securityFilterChain(HttpSecurity http,BearerFilter bearer,ErrorResponseWriter errors,Environment environment,
            UrlBasedCorsConfigurationSource corsConfigurationSource) throws Exception {
        http.cors(cors->cors.configurationSource(corsConfigurationSource))
            .csrf(csrf->csrf.disable()).sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .requestCache(c->c.disable()).formLogin(f->f.disable()).httpBasic(b->b.disable())
            .authorizeHttpRequests(a->{
                a.requestMatchers(SWAGGER_PATHS).permitAll()
                    .requestMatchers(HttpMethod.POST,"/api/v1/auth/oauth/*/authorization-requests","/api/v1/auth/oauth/*/sessions","/api/v1/auth/sessions/refresh").permitAll()
                    // 초대 미리보기는 공개. BearerFilter는 그대로 거쳐서 로그인한 사용자는 회원 카드를 받는다
                    .requestMatchers(HttpMethod.GET,"/api/v1/invitations/*").permitAll();
                if(environment.acceptsProfiles(Profiles.of("local")))
                    a.requestMatchers(HttpMethod.GET,"/dev/kakao-login","/oauth/kakao/callback").permitAll();
                a.anyRequest().authenticated();
            })
            .exceptionHandling(e->e.authenticationEntryPoint((req,res,ex)->errors.write(res,CommonErrorCode.UNAUTHENTICATED))
                .accessDeniedHandler((req,res,ex)->errors.write(res,CommonErrorCode.FORBIDDEN)))
            .addFilterBefore(bearer,UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
    @Bean FilterRegistrationBean<BearerFilter> disableServletRegistration(BearerFilter filter) {
        var registration=new FilterRegistrationBean<>(filter); registration.setEnabled(false); return registration;
    }

    @Bean UrlBasedCorsConfigurationSource corsConfigurationSource(CorsProperties properties) {
        var configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(properties.allowedOrigins());
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "Idempotency-Key"));
        configuration.setExposedHeaders(List.of("X-Trace-Id"));
        configuration.setAllowCredentials(false);
        configuration.setMaxAge(3600L);
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", configuration);
        return source;
    }
}
