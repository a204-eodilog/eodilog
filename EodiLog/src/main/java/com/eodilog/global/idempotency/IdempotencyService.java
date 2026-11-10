package com.eodilog.global.idempotency;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

// Idempotency-Key 요청 중복 방지(명세 §2). (사용자, 요청 범위, 키)마다 처음 결과를 저장하고 같은 요청에는 그 결과를 돌려준다
// 기록은 생성 작업과 같은 트랜잭션에서 남기므로 작업이 실패하면 기록도 사라져 같은 키로 다시 시도할 수 있다
@Service
@RequiredArgsConstructor
public class IdempotencyService {

	public static final String HEADER_NAME = "Idempotency-Key";

	// 보관 기간은 Q-12 확정 전 24시간(P-4)
	static final Duration RETENTION = Duration.ofHours(24);

	private static final int MAX_KEY_LENGTH = 100;

	private final JdbcTemplate jdbcTemplate;
	private final JsonMapper jsonMapper;
	private final Clock clock;

	@Transactional
	public <T> T execute(UUID userId, String requestScope, String idempotencyKey, Object request,
			Class<T> responseType, HttpStatus successStatus, Supplier<T> action) {
		validateKey(idempotencyKey);
		String requestHash = hash(request);
		Instant now = clock.instant();

		jdbcTemplate.update("""
				delete from idempotency_records
				where user_id = ? and request_scope = ? and idempotency_key = ? and expires_at <= ?
				""", userId, requestScope, idempotencyKey, Timestamp.from(now));
		// 같은 키의 다른 트랜잭션이 진행 중이면 PostgreSQL이 그 트랜잭션이 끝날 때까지 기다린 뒤 충돌 여부를 정한다
		int inserted = jdbcTemplate.update("""
				insert into idempotency_records
				(user_id, request_scope, idempotency_key, request_hash, status, created_at, expires_at)
				values (?, ?, ?, ?, 'IN_PROGRESS', ?, ?)
				on conflict do nothing
				""", userId, requestScope, idempotencyKey, requestHash,
				Timestamp.from(now), Timestamp.from(now.plus(RETENTION)));
		if (inserted == 0) {
			return replay(userId, requestScope, idempotencyKey, requestHash, responseType);
		}

		T response = action.get();
		jdbcTemplate.update("""
				update idempotency_records
				set status = 'COMPLETED', http_status = ?, response_json = ?::jsonb
				where user_id = ? and request_scope = ? and idempotency_key = ?
				""", successStatus.value(), jsonMapper.writeValueAsString(response),
				userId, requestScope, idempotencyKey);
		return response;
	}

	private <T> T replay(UUID userId, String requestScope, String idempotencyKey, String requestHash,
			Class<T> responseType) {
		List<StoredRecord> records = jdbcTemplate.query("""
				select status, request_hash, response_json::text as response_json
				from idempotency_records
				where user_id = ? and request_scope = ? and idempotency_key = ?
				""", (rs, rowNum) -> new StoredRecord(rs.getString("status"), rs.getString("request_hash"),
				rs.getString("response_json")), userId, requestScope, idempotencyKey);
		if (records.isEmpty() || "IN_PROGRESS".equals(records.getFirst().status())) {
			throw new BusinessException(IdempotencyErrorCode.REQUEST_IN_PROGRESS);
		}
		StoredRecord record = records.getFirst();
		if (!record.requestHash().equals(requestHash)) {
			throw new BusinessException(IdempotencyErrorCode.IDEMPOTENCY_KEY_REUSED);
		}
		return jsonMapper.readValue(record.responseJson(), responseType);
	}

	// 같은 키로 이미 끝난 요청이 있으면 처음 결과를 돌려주고, 본문이 다르면 409 IDEMPOTENCY_KEY_REUSED다.
	// 기록이 없거나 진행 중이면 비어 있고 판정은 execute가 한다.
	// execute 앞에서 외부 호출(날씨 조회 등)을 하는 요청이 재요청 때 그 호출과 사전 검사를 건너뛰도록 쓴다
	@Transactional(readOnly = true)
	public <T> Optional<T> findCompleted(UUID userId, String requestScope, String idempotencyKey, Object request,
			Class<T> responseType) {
		validateKey(idempotencyKey);
		List<StoredRecord> records = jdbcTemplate.query("""
				select status, request_hash, response_json::text as response_json
				from idempotency_records
				where user_id = ? and request_scope = ? and idempotency_key = ? and status = 'COMPLETED' and expires_at > ?
				""", (rs, rowNum) -> new StoredRecord(rs.getString("status"), rs.getString("request_hash"),
				rs.getString("response_json")), userId, requestScope, idempotencyKey, Timestamp.from(clock.instant()));
		if (records.isEmpty()) {
			return Optional.empty();
		}
		StoredRecord record = records.getFirst();
		if (!record.requestHash().equals(hash(request))) {
			throw new BusinessException(IdempotencyErrorCode.IDEMPOTENCY_KEY_REUSED);
		}
		return Optional.of(jsonMapper.readValue(record.responseJson(), responseType));
	}

	// execute 안에서도 검사한다. 호출 측이 권한 검사보다 먼저 키 형식 400을 내야 할 때 따로 부른다(명세 §2 입력 오류 우선)
	public void validateKey(String idempotencyKey) {
		if (idempotencyKey == null || idempotencyKey.isBlank() || idempotencyKey.length() > MAX_KEY_LENGTH) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
					List.of(new ErrorField(HEADER_NAME, "1~" + MAX_KEY_LENGTH + "자의 요청 키가 필요합니다.")));
		}
	}

	// 파싱한 요청 DTO를 직렬화해 해시한다. 공백·줄바꿈만 다른 같은 본문은 같은 요청으로 본다
	private String hash(Object request) {
		try {
			byte[] json = jsonMapper.writeValueAsString(request).getBytes(StandardCharsets.UTF_8);
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json));
		} catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException(ex);
		}
	}

	private record StoredRecord(String status, String requestHash, String responseJson) {
	}

}
