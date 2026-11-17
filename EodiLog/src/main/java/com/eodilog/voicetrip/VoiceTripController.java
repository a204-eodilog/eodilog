package com.eodilog.voicetrip;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.security.AuthUser;
import com.eodilog.trip.controller.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

// 말로 여행 만들기(실험). 앱은 내부 AI 서버에 직접 닿을 수 없어 로그인한 사용자 요청을 여기서 넘긴다
// 저장하는 것은 없다. 만든 초안으로 여행을 만드는 것은 앱이 기존 여행·일정 API로 한다
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/voice-trip")
@Tag(name = "말로 여행 만들기(실험)", description = "쭉 말한 녹음으로 새 여행 초안 만들기")
public class VoiceTripController {

	private static final Pattern JOB_ID = Pattern.compile("[0-9a-f]{32}");
	private static final int MAX_TEXT = 8000;
	private static final int MAX_DRAFT = 200_000;
	private static final int MAX_CANDIDATE_BODY = 4096;

	private final VoiceTripAiClient ai;
	private final VoiceTripJobOwners owners;

	@PostMapping(value = "/jobs", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@Operation(summary = "정리 작업 만들기", description = "audio(M4A, 최대 10분) 또는 text. 202와 작업 상태. 만든 사람만 조회한다")
	public ResponseEntity<byte[]> start(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
			@RequestPart(name = "audio", required = false) MultipartFile audio,
			@RequestParam(name = "text", required = false) String text) {
		UUID userId = CurrentUser.requireUserId(user);
		VoiceTripAiClient.Upload upload = upload(audio);
		if (upload == null) requireText(text, MAX_TEXT);
		byte[] body = ai.startJob(text, upload);
		owners.put(ai.jobId(body), userId);
		return json(HttpStatus.ACCEPTED, body);
	}

	@GetMapping("/jobs/{jobId}")
	@Operation(summary = "정리 작업 보기", description = "단계와 끝난 뒤의 초안. 30분 뒤 사라진다")
	public ResponseEntity<byte[]> job(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
			@PathVariable String jobId) {
		UUID userId = CurrentUser.requireUserId(user);
		if (!JOB_ID.matcher(jobId).matches() || !owners.owns(jobId, userId)) {
			throw new BusinessException(CommonErrorCode.NOT_FOUND);
		}
		return json(HttpStatus.OK, ai.getJob(jobId));
	}

	@PostMapping(value = "/fixes", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@Operation(summary = "초안 고치기", description = "draft(JSON) + audio(최대 1분) 또는 text. 바꿀 명령과 변경 목록")
	public ResponseEntity<byte[]> fix(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
			@RequestParam(name = "draft") String draft,
			@RequestPart(name = "audio", required = false) MultipartFile audio,
			@RequestParam(name = "text", required = false) String text) {
		CurrentUser.requireUserId(user);
		if (draft.isBlank() || draft.length() > MAX_DRAFT) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, "초안이 올바르지 않습니다.");
		}
		VoiceTripAiClient.Upload upload = upload(audio);
		if (upload == null) requireText(text, 500);
		return json(HttpStatus.OK, ai.fix(draft, text, upload));
	}

	@PostMapping(value = "/candidates", consumes = MediaType.APPLICATION_JSON_VALUE)
	@Operation(summary = "장소 후보", description = "{query, destination, near}. AI가 고른 곳 대신 고를 근처 후보")
	public ResponseEntity<byte[]> candidates(@Parameter(hidden = true) @AuthenticationPrincipal AuthUser user,
			@RequestBody byte[] body) {
		CurrentUser.requireUserId(user);
		if (body.length == 0 || body.length > MAX_CANDIDATE_BODY) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
		}
		return json(HttpStatus.OK, ai.candidates(body));
	}

	private static VoiceTripAiClient.Upload upload(MultipartFile audio) {
		if (audio == null || audio.isEmpty()) return null;
		String type = audio.getContentType();
		String name = audio.getOriginalFilename();
		try {
			return new VoiceTripAiClient.Upload(
					name == null || name.isBlank() ? "recording.m4a" : name,
					type == null || type.isBlank() ? "audio/mp4" : type,
					audio.getBytes());
		} catch (IOException | IllegalArgumentException e) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, "녹음 파일을 읽지 못했습니다.");
		}
	}

	private static void requireText(String text, int max) {
		if (text == null || text.isBlank()) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, "녹음이나 text가 있어야 합니다.");
		}
		if (text.length() > max) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, "글이 너무 깁니다.");
		}
	}

	private static ResponseEntity<byte[]> json(HttpStatus status, byte[] body) {
		return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON).body(body);
	}

}
