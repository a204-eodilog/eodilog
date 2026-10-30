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
import com.eodilog.domain.auth.*;

@Configuration
@EnableConfigurationProperties(AuthProperties.class)
public class SecurityConfig {
    private static final String[] SWAGGER_PATHS={"/swagger-ui.html","/swagger-ui/**","/v3/api-docs/**"};
    @Bean SecurityFilterChain securityFilterChain(HttpSecurity http,BearerFilter bearer,ErrorResponseWriter errors) throws Exception {
        http.csrf(csrf->csrf.disable()).sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .requestCache(c->c.disable()).formLogin(f->f.disable()).httpBasic(b->b.disable())
            .authorizeHttpRequests(a->{
                a.requestMatchers(SWAGGER_PATHS).permitAll()
                    .requestMatchers(HttpMethod.POST,"/api/v1/auth/oauth/*/authorization-requests","/api/v1/auth/oauth/*/sessions").permitAll();
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
}
