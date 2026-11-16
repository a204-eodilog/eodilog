package com.eodilog.extraction;

import com.eodilog.job.Job;
import com.eodilog.place.dto.PlaceView;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

// GET /extractions/{jobId} 응답(명세 §10 ExtractionResult). 작업이 성공하기 전에는 resultStatus=null, candidates=[]
@Schema(description = "장소 추출 진행·결과. 후보는 아직 저장·방문이 아니다")
public record ExtractionResult(
		@Schema(description = "작업 상태. 실패·취소 사유는 job.error", requiredMode = Schema.RequiredMode.REQUIRED)
		Job job,

		@Schema(description = """
				추출 결과. SUCCESS(언급마다 장소 1곳 확정) / MULTIPLE_CANDIDATES(여러 지점이거나 장소를 못 찾은 언급 있음) /
				NOT_FOUND(장소 언급 없음) / FAILED(모든 자료를 읽지 못함). 작업이 성공하기 전에는 null""",
				example = "MULTIPLE_CANDIDATES", nullable = true, requiredMode = Schema.RequiredMode.REQUIRED)
		ResultStatus resultStatus,

		@Schema(description = "후보. 같은 name의 후보들은 한 언급의 여러 지점이다", requiredMode = Schema.RequiredMode.REQUIRED)
		List<Candidate> candidates,

		@Schema(description = """
				자료에 글자로 보인 지역 단서(인스타 위치 태그·본문·주소, 30자 이하). 장소를 못 찾았을 때 앱이 '이 지역에서 찾기'에 쓴다.
				없거나 작업이 성공하기 전이면 null""",
				example = "강원도 강릉", nullable = true, requiredMode = Schema.RequiredMode.REQUIRED)
		String regionHint) {

	public enum ResultStatus {
		SUCCESS, MULTIPLE_CANDIDATES, NOT_FOUND, FAILED
	}

	@Schema(description = "추출 후보 한 건")
	public record Candidate(
			@Schema(description = "후보 ID", example = "019a0000-0000-7000-8000-000000000201",
					requiredMode = Schema.RequiredMode.REQUIRED)
			UUID candidateId,

			@Schema(description = "자료에서 찾은 장소 언급", example = "바다 앞 카페", requiredMode = Schema.RequiredMode.REQUIRED)
			String name,

			@Schema(description = "연결한 로컬 장소(places.id). 지도에서 찾지 못하면 null — 장소 검색·수동 장소로 고른다",
					nullable = true, requiredMode = Schema.RequiredMode.REQUIRED)
			PlaceView place,

			@Schema(description = "찾은 근거 문구", example = "캡처 속 간판에서 찾았어요", requiredMode = Schema.RequiredMode.REQUIRED)
			String evidence,

			@Schema(description = "언급과 장소 이름의 유사도 0~1. place가 null이면 null", example = "1.0", nullable = true,
					requiredMode = Schema.RequiredMode.REQUIRED)
			Double confidence) {
	}

}
