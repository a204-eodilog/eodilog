package com.eodilog.extraction;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.job.Job;
import com.eodilog.job.JobErrorCode;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobRef;
import com.eodilog.job.JobService;
import com.eodilog.job.JobSubmission;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

// AI 장소 추출(명세 §5). 후보만 만들고 저장·방문은 하지 않는다. 고른 후보는 기존 북마크·여행 저장 API로 저장한다
@Service
@RequiredArgsConstructor
public class ExtractionService {

	static final String REQUEST_SCOPE = "POST /api/v1/extractions";
	static final int MAX_CAPTURES = 10;
	// AI 서버 입력 한도와 같다(AI spec AS-11)
	static final int URL_MAX_LENGTH = 2048;
	static final int MEMO_MAX_LENGTH = 500;
	// AI 서버 링크 검사(_parse_target)와 같은 규칙: http(s), host 있음, 계정 정보 없음, 포트 생략·80·443
	private static final Pattern URL = Pattern.compile("^(https?)://([^/?#]*)([/?#].*)?$", Pattern.CASE_INSENSITIVE);
	private static final Set<String> ALLOWED_PORTS = Set.of("80", "443");

	private final IdempotencyService idempotencyService;
	private final ExtractionAccess access;
	private final JobService jobService;
	private final JsonMapper jsonMapper;

	// 같은 키 재요청 판정에 쓰는 정규화한 본문
	record Fingerprint(String url, List<String> captureAssetIds, String memo) {
	}

	// 판정 순서(정책 E-5): 키 형식 400 → 본문 400 → 캡처 개수 422 → 설정 OFF 409 → 캡처 검사 400 → 등록(같은 키면 처음 JobRef)
	@Transactional
	public JobRef request(UUID userId, String idempotencyKey, ExtractionRequest request) {
		idempotencyService.validateKey(idempotencyKey);
		String url = normalizeUrl(request.url());
		String memo = normalizeMemo(request.memo());
		List<UUID> captureIds = request.captureAssetIds() == null ? List.of() : request.captureAssetIds();
		if (captureIds.stream().anyMatch(java.util.Objects::isNull)
				|| new HashSet<>(captureIds).size() != captureIds.size()) {
			throw invalid("captureAssetIds", "캡처 ID는 비어 있거나 중복될 수 없습니다.");
		}
		if (url == null && captureIds.isEmpty()) {
			String message = "링크나 캡처 중 하나는 필요합니다.";
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
					List.of(new ErrorField("url", message), new ErrorField("captureAssetIds", message)));
		}
		if (captureIds.size() > MAX_CAPTURES) {
			throw new BusinessException(ExtractionErrorCode.INPUT_LIMIT_EXCEEDED);
		}
		if (access.disabled(userId)) {
			throw new BusinessException(ExtractionErrorCode.AI_FEATURE_DISABLED);
		}
		access.requireUsableCaptures(userId, captureIds);
		List<String> ids = captureIds.stream().map(UUID::toString).toList();
		return idempotencyService.execute(userId, REQUEST_SCOPE, idempotencyKey, new Fingerprint(url, ids, memo),
				JobRef.class, HttpStatus.ACCEPTED,
				() -> jobService.submit(new JobSubmission(userId, JobKind.PLACE_EXTRACTION, null, snapshot(url, ids, memo),
						null, null)));
	}

	// 진행 중·실패·취소면 resultStatus=null, candidates=[]. 사유는 job.error. 남의 작업·다른 종류·지운 작업은 404
	@Transactional(readOnly = true)
	public ExtractionResult get(UUID viewerId, UUID jobId) {
		Job job = jobService.get(viewerId, jobId);
		if (job.kind() != JobKind.PLACE_EXTRACTION) {
			throw new BusinessException(JobErrorCode.JOB_NOT_FOUND);
		}
		if (job.result() == null) {
			return new ExtractionResult(job, null, List.of());
		}
		StoredExtraction stored = StoredExtraction.parse(job.result(), jsonMapper)
				.orElseThrow(() -> new IllegalStateException("Invalid stored place extraction"));
		return new ExtractionResult(job, stored.resultStatus(), stored.candidates());
	}

	// 작업 취소와 입력·후보 제거(정책 E-18·E-20). 저장한 일반 장소·북마크는 그대로 둔다
	@Transactional
	public void delete(UUID viewerId, UUID jobId) {
		JobSubmission submission = jobService.discard(viewerId, jobId, JobKind.PLACE_EXTRACTION);
		access.releaseCaptures(viewerId, jobId, PlaceExtractionJobHandler.captureIds(submission.input()));
	}

	// 정책 E-7: url·memo·캡처 ID만. 파일 바이트·저장소 키는 넣지 않는다
	private ObjectNode snapshot(String url, List<String> captureIds, String memo) {
		ObjectNode input = jsonMapper.createObjectNode();
		input.put("url", url);
		input.put("memo", memo);
		var array = input.putArray("captureAssetIds");
		captureIds.forEach(array::add);
		return input;
	}

	static String normalizeUrl(String raw) {
		if (raw == null || raw.isBlank()) {
			return null;
		}
		String url = raw.strip();
		if (url.length() > URL_MAX_LENGTH || url.chars().anyMatch(Character::isWhitespace)) {
			throw invalid("url", "http(s) 공개 주소만 보낼 수 있습니다.");
		}
		Matcher matcher = URL.matcher(url);
		if (!matcher.matches() || !validAuthority(matcher.group(2))) {
			throw invalid("url", "http(s) 공개 주소만 보낼 수 있습니다.");
		}
		return url;
	}

	private static boolean validAuthority(String authority) {
		if (authority.isEmpty() || authority.contains("@")) {
			return false;
		}
		String host = authority;
		String port = null;
		if (authority.startsWith("[")) {
			int end = authority.indexOf(']');
			if (end < 0) {
				return false;
			}
			host = authority.substring(0, end + 1);
			String rest = authority.substring(end + 1);
			if (!rest.isEmpty()) {
				if (!rest.startsWith(":")) {
					return false;
				}
				port = rest.substring(1);
			}
		} else {
			int colon = authority.lastIndexOf(':');
			if (colon >= 0) {
				host = authority.substring(0, colon);
				port = authority.substring(colon + 1);
			}
		}
		return !host.isEmpty() && !"[]".equals(host)
				&& (port == null || ALLOWED_PORTS.contains(port.toLowerCase(Locale.ROOT)));
	}

	static String normalizeMemo(String raw) {
		if (raw == null || raw.isBlank()) {
			return null;
		}
		String memo = raw.strip();
		if (memo.codePointCount(0, memo.length()) > MEMO_MAX_LENGTH) {
			throw invalid("memo", "메모는 500자까지 쓸 수 있습니다.");
		}
		return memo;
	}

	private static BusinessException invalid(String field, String message) {
		return new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
				List.of(new ErrorField(field, message)));
	}

}
