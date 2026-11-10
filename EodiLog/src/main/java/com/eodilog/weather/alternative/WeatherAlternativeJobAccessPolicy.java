package com.eodilog.weather.alternative;

import com.eodilog.job.JobAccessPolicy;
import com.eodilog.job.JobContext;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobSubmission;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// WEATHER_ALTERNATIVES 권한(명세 §9 AI 작업 권한표, 정책 W-19)
// 등록·실행·완료: 요청자가 삭제 안 된 여행의 ACTIVE 멤버이고 날씨 대안 설정이 OFF가 아니어야 한다. 깨지면 CANCELLED
// 조회: 공동 코스의 대안이므로 그 여행의 현재 ACTIVE 멤버 누구나. 요청자도 나가면 볼 수 없다
@Component
@RequiredArgsConstructor
public class WeatherAlternativeJobAccessPolicy implements JobAccessPolicy {

	private final WeatherAccess access;
	private final JsonMapper jsonMapper;

	@Override
	public JobKind kind() {
		return JobKind.WEATHER_ALTERNATIVES;
	}

	@Override
	public boolean canSubmit(JobSubmission submission) {
		return access.requesterAllowed(submission.tripId(), submission.requestedByUserId());
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
		return access.activeMember(context.submission().tripId(), viewerUserId);
	}

	@Override
	public JsonNode publicResult(UUID viewerUserId, JobContext context, JsonNode storedResult) {
		return WeatherAlternativeResult.project(storedResult, jsonMapper);
	}

}
