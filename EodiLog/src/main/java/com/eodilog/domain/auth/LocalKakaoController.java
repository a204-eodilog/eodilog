package com.eodilog.domain.auth;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.Hidden;

/** Browser-only local diagnostics; never packaged as an automatically served static file. */
@RestController
@Profile("local")
@Hidden
public class LocalKakaoController {
    @GetMapping(value={"/dev/kakao-login","/oauth/kakao/callback"}, produces=MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> page() throws IOException {
        String html=new ClassPathResource("local-dev/kakao-login.html").getContentAsString(StandardCharsets.UTF_8);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .header("Referrer-Policy","no-referrer")
            .header("X-Content-Type-Options","nosniff")
            .header("Content-Security-Policy","default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
            .body(html.replace("__LOCAL_CALLBACK_URI__","http://localhost:8080/oauth/kakao/callback"));
    }
}
