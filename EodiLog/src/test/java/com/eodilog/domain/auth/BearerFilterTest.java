package com.eodilog.domain.auth;

import com.eodilog.global.common.error.*;
import com.eodilog.global.security.AuthUser;
import com.eodilog.user.service.UserCardReader;
import com.eodilog.user.dto.UserCard;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.io.IOException;
import java.time.Instant;
import java.util.UUID;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(OutputCaptureExtension.class)
class BearerFilterTest {
    final Tokens tokens=mock(Tokens.class);
    final AuthService auth=mock(AuthService.class);
    final JsonMapper mapper=JsonMapper.builder().build();
    final BearerFilter filter=new BearerFilter(tokens,auth,new ErrorResponseWriter(mapper));
    final FilterChain chain=mock(FilterChain.class);
    @AfterEach void clearContext() { SecurityContextHolder.clearContext(); }
    MockHttpServletRequest request() {
        var request=new MockHttpServletRequest("GET","/api/v1/me");
        request.addHeader("Authorization","Bearer token"); return request;
    }
    @Test void storageFailureReturnsSafeJsonAndStopsChain(CapturedOutput output) throws Exception {
        var claims=new Tokens.Claims(UUID.randomUUID(),UUID.randomUUID(),Instant.now().plusSeconds(3600));
        when(tokens.verify("token")).thenReturn(claims);
        when(auth.authenticate(claims)).thenThrow(new DataAccessResourceFailureException("secret-token-private-PII"));
        var response=new MockHttpServletResponse();
        new com.eodilog.global.common.trace.TraceIdFilter().doFilter(request(),response,(req,res)->filter.doFilter(req,res,chain));
        assertThat(response.getStatus()).isEqualTo(500);
        assertThat(response.getContentType()).startsWith("application/json");
        var body=mapper.readTree(response.getContentAsString()).get("error");
        assertThat(body.get("code").asText()).isEqualTo("INTERNAL_ERROR");
        assertThat(body.get("fields").isArray()).isTrue();
        String traceId=body.get("traceId").asText(); assertThat(traceId).matches("[0-9a-f]{32}"); assertThat(response.getHeader("X-Trace-Id")).isEqualTo(traceId);
        assertThat(output.getAll()).contains("traceId="+traceId,"code=INTERNAL_ERROR","diagnostics=org.springframework.dao.DataAccessResourceFailureException[");
        assertThat(response.getContentAsString()).doesNotContain("secret-token-private-PII","DataAccessResourceFailureException");
        assertThat(output.getAll()).doesNotContain("secret-token-private-PII");
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verifyNoInteractions(chain);
    }
    @Test void downstreamExceptionIsNotConvertedByAuthenticationCatch() throws Exception {
        var request=new MockHttpServletRequest("GET","/api/v1/me");
        var response=new MockHttpServletResponse();
        var exception=new ServletException("controller-owned failure");
        doThrow(exception).when(chain).doFilter(request,response);
        assertThatThrownBy(()->filter.doFilter(request,response,chain)).isSameAs(exception);
        assertThat(response.getContentAsString()).isEmpty();
    }
    @Test void responseWriteFailureEscapesWithoutRetry() throws Exception {
        when(tokens.verify("token")).thenThrow(new DataAccessResourceFailureException("private"));
        var response=mock(HttpServletResponse.class);
        var writeFailure=new IOException("write failure");
        when(response.getOutputStream()).thenThrow(writeFailure);
        assertThatThrownBy(()->filter.doFilter(request(),response,chain)).isSameAs(writeFailure);
        verify(response,times(1)).getOutputStream(); verifyNoInteractions(chain);
    }
}
