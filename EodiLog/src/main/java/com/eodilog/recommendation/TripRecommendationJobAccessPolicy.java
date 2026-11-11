package com.eodilog.recommendation;

import com.eodilog.job.JobAccessPolicy;
import com.eodilog.job.JobContext;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobSubmission;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

// TRIP_RECOMMENDATION 권한(명세 §9 AI 작업 권한표). 등록·실행·완료: 요청자가 삭제 안 된 여행의 ACTIVE 멤버. 깨지면 CANCELLED.
// 조회: 그룹 추천이므로 그 여행의 현재 ACTIVE 멤버 누구나. 요청자도 나가면 볼 수 없다.
// 취향 동의는 등록 때 멤버마다 이 여행에서 쓸 수 있는 취향만 고정하는 것으로 지킨다(TripRecommendationSnapshot)
@Component
@RequiredArgsConstructor
public class TripRecommendationJobAccessPolicy implements JobAccessPolicy {

	private final JdbcTemplate jdbcTemplate;
	private final RecommendationPublisher publisher;
	private final JsonMapper jsonMapper;

	@Override
	public JobKind kind() {
		return JobKind.TRIP_RECOMMENDATION;
	}

	@Override
	public boolean canSubmit(JobSubmission submission) {
		return activeMember(submission.tripId(), submission.requestedByUserId());
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
		return activeMember(context.submission().tripId(), viewerUserId);
	}

	// GET /jobs의 result. 입력 스냅샷(취향·좌표)은 내보내지 않고, 장소·지역은 공개 Place·Region으로 바꾼다
	@Override
	public JsonNode publicResult(UUID viewerUserId, JobContext context, JsonNode storedResult) {
		StoredRecommendation stored = StoredRecommendation.parseStored(storedResult)
				.orElseThrow(() -> new IllegalStateException("Invalid stored trip recommendation"));
		ObjectNode node = jsonMapper.createObjectNode();
		node.set("items", jsonMapper.valueToTree(publisher.items(stored)));
		node.set("basis", jsonMapper.valueToTree(publisher.basis(stored)));
		node.put("insufficientData", stored.insufficientData());
		return node;
	}

	private boolean activeMember(UUID tripId, UUID userId) {
		if (tripId == null || userId == null) return false;
		return Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
				select exists(select 1 from trips t join trip_members m on m.trip_id = t.id
				where t.id = ? and t.deleted_at is null and m.user_id = ? and m.status = 'ACTIVE')""",
				Boolean.class, tripId, userId));
	}

}
