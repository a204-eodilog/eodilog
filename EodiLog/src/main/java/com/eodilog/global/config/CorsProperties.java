package com.eodilog.global.config;

import java.net.URI;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

// 와일드카드·앱 스킴·경로가 아닌 명시적 웹 origin만 설정한다.
@ConfigurationProperties("app.cors")
public record CorsProperties(List<String> allowedOrigins) {
	public CorsProperties {
		allowedOrigins = allowedOrigins == null ? List.of() : allowedOrigins.stream()
				.map(String::strip).filter(value -> !value.isEmpty()).distinct().toList();
		for (String origin : allowedOrigins) {
			URI uri;
			try {
				uri = URI.create(origin);
			} catch (IllegalArgumentException ex) {
				throw invalidOrigin();
			}
			if (!("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))
					|| uri.getHost() == null || uri.getRawUserInfo() != null
					|| (uri.getRawPath() != null && !uri.getRawPath().isEmpty())
					|| uri.getRawQuery() != null || uri.getRawFragment() != null
					|| uri.getPort() > 65535 || origin.endsWith(":")) {
				throw invalidOrigin();
			}
		}
	}

	private static IllegalArgumentException invalidOrigin() {
		return new IllegalArgumentException("CORS origin은 경로·인증정보 없는 http(s)://host[:port] 형식이어야 합니다.");
	}
}
