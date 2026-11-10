package com.eodilog.user;

import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.security.AuthUser;
import com.eodilog.user.dto.UserCard;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users")
@Tag(name = "회원", description = "닉네임 검색과 다른 사용자 프로필")
public class UserController {

	private final UserQueryService service;

	public UserController(UserQueryService service) {
		this.service = service;
	}

	@GetMapping
	@Operation(summary = "회원 검색",
			description = "로그인. 닉네임 부분 일치(대소문자 무시)만 지원하며 프로필 링크·ID 검색은 없다. 공백을 뺀 1~50자. 본인·탈퇴·가입 대기 회원 제외. 비공개 계정도 카드는 보인다. 완전 일치 먼저, 그다음 닉네임순. limit 1~50")
	@ApiResponse(responseCode = "200", description = "검색 결과")
	public PageResponse<UserCard> search(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
			@Parameter(description = "닉네임 검색어") @RequestParam String query,
			@RequestParam(required = false) String cursor, @RequestParam(defaultValue = "20") int limit) {
		return service.search(user.userId(), query, cursor, limit);
	}

	@GetMapping("/{userId}")
	@Operation(summary = "다른 사용자 프로필",
			description = "로그인. UserCard와 팔로워·팔로잉 수(ACCEPTED, 비공개 계정 포함). 연령·이메일·동의 정보는 반환하지 않는다. 본인 조회도 된다")
	@ApiResponse(responseCode = "200", description = "프로필")
	@ApiResponse(responseCode = "404", description = "USER_NOT_FOUND: 없는·탈퇴·가입 대기 회원")
	public DataResponse<PublicProfile> profile(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
			@Parameter(description = "사용자 ID") @PathVariable UUID userId) {
		return DataResponse.of(service.profile(user.userId(), userId));
	}

}
