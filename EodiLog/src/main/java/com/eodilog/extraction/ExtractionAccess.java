package com.eodilog.extraction;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

// 장소 추출이 읽는 설정·캡처 파일. 설정·파일 코드는 고치지 않고 필요한 열만 직접 읽는다(S-14·S-15와 같은 방식)
@Component
@RequiredArgsConstructor
class ExtractionAccess {

	private final JdbcTemplate jdbcTemplate;

	// 캡처 파일 중 추출에 쓸 수 있는 것. 표시본(EXIF를 지운 사본)만 읽는다. 원본은 업로드 기한 뒤 정리된다
	record Capture(UUID id, String displayKey, String contentType) {
	}

	private record Row(UUID id, UUID ownerId, String purpose, String status, String displayKey, String displayContentType) {

		boolean usableBy(UUID userId) {
			return ownerId.equals(userId) && "CAPTURE".equals(purpose) && "READY".equals(status) && displayContentType != null;
		}

	}

	// 행이 없으면 첫 조회 전이라 기본값 CONFIRM이다. 설정 코드는 첫 조회 때 행을 만들므로(쓰기) 여기서 부르지 않는다
	boolean disabled(UUID userId) {
		List<String> modes = jdbcTemplate.queryForList(
				"select extraction_mode from user_settings where user_id = ?", String.class, userId);
		return !modes.isEmpty() && "OFF".equals(modes.getFirst());
	}

	/**
	 * 등록 검사(정책 E-6). 캡처를 id 순서로 잠그고 모두 내 READY CAPTURE인지 본다. 삭제(E-20)도 같은 순서로 잠가 교착이 없고,
	 * 등록이 커밋되기 전에는 그 캡처를 지울 수 없다. 남의 파일·없는 파일도 같은 400이라 존재 여부가 드러나지 않는다
	 */
	void requireUsableCaptures(UUID userId, List<UUID> captureIds) {
		if (captureIds.isEmpty()) {
			return;
		}
		Map<UUID, Row> rows = lock(captureIds);
		for (int i = 0; i < captureIds.size(); i++) {
			Row row = rows.get(captureIds.get(i));
			if (row == null || !row.usableBy(userId)) {
				throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
						List.of(new ErrorField("captureAssetIds[" + i + "]",
								"내가 올려 확인까지 끝낸 캡처(JPG·PNG)만 보낼 수 있습니다.")));
			}
		}
	}

	// 실행 때 다시 읽는다(정책 E-10). 그 사이 지워지거나 상태가 바뀐 파일은 건너뛴다. 잠그지 않는다
	Optional<Capture> usableCapture(UUID userId, UUID captureId) {
		return jdbcTemplate.query("""
						select id, owner_user_id, purpose, status, display_key, display_content_type
						from assets where id = ?""", ExtractionAccess::map, captureId).stream()
				.filter(row -> row.usableBy(userId))
				.findFirst()
				.map(row -> new Capture(row.id(), row.displayKey(), row.displayContentType()));
	}

	/**
	 * 추출 삭제 때 캡처 정리(정책 E-20). 같은 순서로 잠근 뒤, 지워지지 않은 다른 추출 작업이 쓰지 않는 내 캡처만 DELETING으로 바꾼다.
	 * 저장소 객체 삭제와 재시도는 AssetCleanup의 DELETING 경로가 맡는다. 호출 전 이 작업은 이미 삭제 표시가 되어 있어야 한다
	 */
	void releaseCaptures(UUID userId, UUID jobId, List<UUID> captureIds) {
		if (captureIds.isEmpty()) {
			return;
		}
		Map<UUID, Row> rows = lock(captureIds);
		for (Row row : rows.values()) {
			if (!row.usableBy(userId)) {
				continue;
			}
			// 잠근 뒤 따로 조회해 방금 커밋된 다른 등록도 본다(READ COMMITTED). JDBC 자리표시자와 겹치는 jsonb ? 대신 @>를 쓴다
			Boolean referenced = jdbcTemplate.queryForObject("""
					select exists(select 1 from jobs
					  where kind = 'PLACE_EXTRACTION' and deleted_at is null and id <> ? and requested_by_user_id = ?
					    and input_json -> 'captureAssetIds' @> jsonb_build_array(?::text))""",
					Boolean.class, jobId, userId, row.id().toString());
			if (!Boolean.TRUE.equals(referenced)) {
				jdbcTemplate.update("update assets set status = 'DELETING' where id = ? and status = 'READY'", row.id());
			}
		}
	}

	private Map<UUID, Row> lock(List<UUID> ids) {
		// 잠금 순서는 SQL의 order by id(PostgreSQL uuid 순서)가 정한다. 등록과 삭제가 모두 이 메서드를 쓴다
		String[] sorted = ids.stream().distinct().map(UUID::toString).toArray(String[]::new);
		return jdbcTemplate.query("""
						select id, owner_user_id, purpose, status, display_key, display_content_type
						from assets where id = any(?::uuid[]) order by id for update""", ExtractionAccess::map, (Object) sorted)
				.stream().collect(Collectors.toMap(Row::id, Function.identity()));
	}

	private static Row map(java.sql.ResultSet rs, int rowNum) throws java.sql.SQLException {
		return new Row(rs.getObject("id", UUID.class), rs.getObject("owner_user_id", UUID.class), rs.getString("purpose"),
				rs.getString("status"), rs.getString("display_key"), rs.getString("display_content_type"));
	}

}
