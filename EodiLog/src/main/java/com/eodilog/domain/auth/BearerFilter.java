package com.eodilog.domain.auth;

import com.eodilog.global.common.error.*;
import java.io.IOException;
import java.util.List;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import com.eodilog.global.security.AuthUser;
import com.eodilog.global.common.trace.TraceIdFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component
public class BearerFilter extends OncePerRequestFilter {
    public static final String SESSION_CLAIMS_ATTRIBUTE="com.eodilog.domain.auth.BearerFilter.sessionClaims";
    private static final Logger log=LoggerFactory.getLogger(BearerFilter.class);
    private final Tokens tokens; private final AuthService auth; private final ErrorResponseWriter errors;
    public BearerFilter(Tokens tokens,AuthService auth,ErrorResponseWriter errors) { this.tokens=tokens; this.auth=auth; this.errors=errors; }
    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        String path=request.getRequestURI().substring(request.getContextPath().length());
        return path.equals("/swagger-ui.html") || path.startsWith("/swagger-ui/") || path.equals("/v3/api-docs") || path.startsWith("/v3/api-docs/")
            || (request.getMethod().equals("POST") && (path.equals("/api/v1/auth/sessions/refresh") || path.matches("/api/v1/auth/oauth/[^/]+/(authorization-requests|sessions)")));
    }
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
        String header=request.getHeader("Authorization");
        if(header!=null) {
            try {
                if(header.length()<8 || !header.regionMatches(true,0,"Bearer ",0,7)) throw new BusinessException(CommonErrorCode.UNAUTHENTICATED);
                var claims=tokens.verify(header.substring(7)); var profile=auth.authenticate(claims);
                request.setAttribute(SESSION_CLAIMS_ATTRIBUTE,claims);
                SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(new AuthUser(claims.userId()),null,List.of()));
                boolean me=request.getRequestURI().equals(request.getContextPath()+"/api/v1/me") && (request.getMethod().equals("GET") || request.getMethod().equals("PATCH"));
                boolean logout=request.getMethod().equals("DELETE") && request.getRequestURI().equals(request.getContextPath()+"/api/v1/auth/session");
                if(!profile.profileCompleted() && !me && !logout) throw new BusinessException(AuthErrorCode.PROFILE_INCOMPLETE);
            } catch(BusinessException e) { SecurityContextHolder.clearContext(); errors.write(response,e.getErrorCode()); return; }
            catch(RuntimeException e) {
                SecurityContextHolder.clearContext();
                log.error("API failure traceId={} code=INTERNAL_ERROR exceptionType={}",TraceIdFilter.currentTraceId(),e.getClass().getName());
                errors.write(response,CommonErrorCode.INTERNAL_ERROR);
                return;
            }
        }
        chain.doFilter(request,response);
    }
}
