package com.eodilog.user.account;

import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.security.AuthUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me")
@Tag(name = "프로필", description = "본인 조회, 닉네임 가입 완료, 프로필 수정")
public class AccountController {

	private final AccountDeletionService service;

	public AccountController(AccountDeletionService service) {
		this.service = service;
	}

	@Operation(summary = "회원 탈퇴", description = "본인(가입 대기 포함). 즉시 탈퇴하고 복구할 수 없다(Q-11). 같은 요청에서 참여 중인 여행을 "
			+ "모두 나가고(방장이면 가장 먼저 참여한 동행에게 넘기고, 혼자면 여행 삭제), 모든 세션을 폐기하고, 카카오 연결을 끊는다(같은 카카오로 "
			+ "다시 가입하면 새 계정). 남는 여행의 내 사진·채팅 본문·방문 평가와 개인 자료(즐겨찾기·설정·취향·알림·좋아요·팔로우)는 서버 내부 작업이 "
			+ "지운다(폴링 없음). 경비와 투표·코스·방문 기록은 남고 작성자는 '탈퇴한 사용자'로 보인다")
	@ApiResponse(responseCode = "202", description = "탈퇴 접수. 이후 이 토큰은 401")
	@DeleteMapping
	@ResponseStatus(HttpStatus.ACCEPTED)
	public DataResponse<AccountDeleteResponse> delete(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user) {
		service.delete(user.userId());
		return DataResponse.of(new AccountDeleteResponse(true));
	}

	public record AccountDeleteResponse(
			@Schema(description = "탈퇴 접수 여부", example = "true", requiredMode = Schema.RequiredMode.REQUIRED)
			boolean accepted) {
	}

}
