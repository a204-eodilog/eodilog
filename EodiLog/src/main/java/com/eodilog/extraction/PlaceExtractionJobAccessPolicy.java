package com.eodilog.extraction;

import com.eodilog.job.JobAccessPolicy;
import com.eodilog.job.JobContext;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobSubmission;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// PLACE_EXTRACTION 권한(명세 §9 권한표, 정책 E-9). 계정 활성 여부는 공통 기반이 본다
// 등록·실행·완료: 요청자의 장소 추출 설정이 OFF가 아니어야 한다. 깨지면 CANCELLED
// 조회: 요청자 본인만. 여행 멤버에게 개인 캡처·추출 결과를 공유하지 않는다
@Component
@RequiredArgsConstructor
public class PlaceExtractionJobAccessPolicy implements JobAccessPolicy {

	private final ExtractionAccess access;
	private final JsonMapper jsonMapper;

	@Override
	public JobKind kind() {
		return JobKind.PLACE_EXTRACTION;
	}

	@Override
	public boolean canSubmit(JobSubmission submission) {
		return !access.disabled(submission.requestedByUserId());
	}

	@Override
	public boolean canExecute(JobContext context) {
		return canSubmit(context.submission());
	}

	@Override
	public boolean canComplete(JobContext context) {
		return canSubmit(context.submission());
	}

	@Override
	public boolean canRead(UUID viewerUserId, JobContext context) {
		return viewerUserId.equals(context.submission().requestedByUserId());
	}

	// 저장할 때 이미 허용 필드만 남겼지만, 공개 직전에도 같은 규칙으로 다시 고른다
	@Override
	public JsonNode publicResult(UUID viewerUserId, JobContext context, JsonNode storedResult) {
		return StoredExtraction.parse(storedResult, jsonMapper)
				.orElseThrow(() -> new IllegalStateException("Invalid stored place extraction"))
				.toJson(jsonMapper);
	}

}
