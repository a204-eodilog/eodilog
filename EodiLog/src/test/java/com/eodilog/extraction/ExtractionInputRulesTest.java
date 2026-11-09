package com.eodilog.extraction;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.eodilog.global.common.error.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

// 등록 전 입력 규칙(정책 E-2). AI 서버 링크 검사(_parse_target)를 통과하는 것만 받아, AI 422로 작업 전체가 실패하지 않게 한다
class ExtractionInputRulesTest {

	@ParameterizedTest
	@ValueSource(strings = {"https://example.com", "HTTP://Example.com/a%20b", "http://example.com:80/x",
			"https://example.com:443?q=1", "https://[2001:db8::1]/a", "https://[2001:db8::1]:443", "https://blog.naver.com/한글글"})
	void acceptsPublicHttpUrls(String url) {
		assertThat(ExtractionService.normalizeUrl("  " + url + "\n")).isEqualTo(url);
	}

	@ParameterizedTest
	@ValueSource(strings = {"ftp://example.com", "https://", "https:///path", "https://user@example.com",
			"https://example.com:8080", "https://example.com:", "https://[2001:db8::1", "https://[]/a", "javascript:alert(1)",
			"https://exa mple.com", "//example.com"})
	void rejectsUrlsTheAiServerRejects(String url) {
		assertThatThrownBy(() -> ExtractionService.normalizeUrl(url)).isInstanceOf(BusinessException.class);
	}

	@Test
	void treatsBlankAsMissingAndLimitsLength() {
		assertThat(ExtractionService.normalizeUrl("   ")).isNull();
		assertThat(ExtractionService.normalizeUrl(null)).isNull();
		String max = "https://example.com/" + "a".repeat(2048 - "https://example.com/".length());
		assertThat(ExtractionService.normalizeUrl(max)).isEqualTo(max);
		assertThatThrownBy(() -> ExtractionService.normalizeUrl(max + "a")).isInstanceOf(BusinessException.class);
	}

	@Test
	void countsMemoInCodePoints() {
		assertThat(ExtractionService.normalizeMemo(" 메모 ")).isEqualTo("메모");
		assertThat(ExtractionService.normalizeMemo("")).isNull();
		String emoji = "😀".repeat(500);
		assertThat(ExtractionService.normalizeMemo(emoji)).isEqualTo(emoji);
		assertThatThrownBy(() -> ExtractionService.normalizeMemo(emoji + "a")).isInstanceOf(BusinessException.class);
	}

}
