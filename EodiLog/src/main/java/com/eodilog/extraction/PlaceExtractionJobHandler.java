package com.eodilog.extraction;

import com.eodilog.asset.AssetErrorCode;
import com.eodilog.extraction.ExtractionResult.Candidate;
import com.eodilog.extraction.ExtractionResult.ResultStatus;
import com.eodilog.global.ai.AiServerClient;
import com.eodilog.global.ai.AiServerClient.FilePart;
import com.eodilog.global.ai.AiServerException;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.id.UuidV7;
import com.eodilog.global.storage.ObjectStorage;
import com.eodilog.job.JobContext;
import com.eodilog.job.JobFailure;
import com.eodilog.job.JobHandler;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobOutcome;
import com.eodilog.job.JobSubmission;
import com.eodilog.place.dto.PlaceView;
import com.eodilog.place.provider.ProviderPlace;
import com.eodilog.place.service.PlaceResolver;
import com.eodilog.region.service.RegionAddressMatcher;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// PLACE_EXTRACTION 실행기(정책 E-10~E-15). 등록 때 고정한 입력(url·memo·캡처 ID)만 쓰고, 캡처 바이트는 실행 때 저장소에서 읽는다
// 장소 연결은 execute에서 한다. complete는 결과를 바꿀 수 없고, 공급자 장소 upsert는 멱등이라 재시도해도 같은 행이 된다
@Component
@RequiredArgsConstructor
public class PlaceExtractionJobHandler implements JobHandler {

	static final String AI_PATH = "/ai/v1/place-extractions";
	static final Set<String> INPUT_FIELDS = Set.of("url", "memo", "captureAssetIds");
	// AI 서버의 장당 한도(AI spec §2). 표시본이 이보다 크면 AI가 422로 작업 전체를 거부하므로 그 장만 건너뛴다
	static final long MAX_CAPTURE_BYTES = 15L * 1024 * 1024;
	static final String PROVIDER = "NAVER";
	private static final int ADDRESS_MAX_LENGTH = 500;

	private final AiServerClient aiServerClient;
	private final ObjectStorage objectStorage;
	private final ExtractionAccess access;
	private final PlaceResolver placeResolver;
	private final RegionAddressMatcher regionAddressMatcher;
	private final JsonMapper jsonMapper;

	@Override
	public JobKind kind() {
		return JobKind.PLACE_EXTRACTION;
	}

	@Override
	public void validate(JobSubmission submission) {
		JsonNode input = submission.input();
		boolean fieldsMatch = input.size() == INPUT_FIELDS.size() && INPUT_FIELDS.stream().allMatch(input::has);
		if (submission.tripId() != null || submission.baseVersion() != null || !fieldsMatch
				|| !input.get("captureAssetIds").isArray()) {
			throw new IllegalArgumentException("Invalid PLACE_EXTRACTION submission");
		}
	}

	@Override
	public JobOutcome execute(JobContext context) {
		UUID jobId = context.jobId();
		UUID requester = context.submission().requestedByUserId();
		JsonNode input = context.submission().input();
		String url = nullableText(input.get("url"));
		String memo = nullableText(input.get("memo"));

		List<FilePart> captures = new ArrayList<>();
		for (UUID captureId : captureIds(input)) {
			Optional<ExtractionAccess.Capture> capture = access.usableCapture(requester, captureId);
			if (capture.isEmpty()) {
				continue;
			}
			byte[] bytes;
			try {
				bytes = objectStorage.read(capture.get().displayKey(), MAX_CAPTURE_BYTES);
			} catch (BusinessException ex) {
				if (ex.getErrorCode() == AssetErrorCode.STORAGE_UNAVAILABLE) {
					return JobOutcome.failed(JobFailure.TEMPORARY_FAILURE);
				}
				// 객체가 없거나 한도를 넘은 캡처는 건너뛰고 읽은 자료로 계속한다(AI spec §2)
				continue;
			}
			String contentType = capture.get().contentType();
			String extension = "image/png".equals(contentType) ? ".png" : ".jpg";
			captures.add(new FilePart("captures", "capture-" + (captures.size() + 1) + extension, contentType, bytes));
		}
		// 링크도 없고 읽은 캡처도 없으면 AI를 부르지 않는다. AI의 "모든 자료를 읽지 못함"과 같은 결과다
		if (url == null && captures.isEmpty()) {
			return JobOutcome.succeeded(new StoredExtraction(ResultStatus.FAILED, List.of()).toJson(jsonMapper));
		}

		Map<String, String> fields = new LinkedHashMap<>();
		fields.put("url", url);
		fields.put("memo", memo);
		JsonNode data;
		try {
			// jobId를 추적 ID로 보낸다. AI는 저장하는 것이 없어 같은 jobId로 다시 불려도 안전하다(at-least-once)
			data = aiServerClient.postMultipart(AI_PATH, jobId, fields, captures);
		} catch (AiServerException ex) {
			return JobOutcome.failed(ex.retryable() ? JobFailure.TEMPORARY_FAILURE : JobFailure.EXECUTION_FAILED);
		}

		Optional<AiResult> parsed = AiResult.parse(data);
		if (parsed.isEmpty()) {
			// 형식이 어긋난 응답은 다시 불러도 같을 가능성이 커서 재시도하지 않는다(정책 E-12·E-13)
			return JobOutcome.failed(JobFailure.EXECUTION_FAILED);
		}
		List<Candidate> candidates = new ArrayList<>();
		Map<String, PlaceView> resolved = new HashMap<>();
		try {
			for (AiCandidate candidate : parsed.get().candidates()) {
				PlaceView place = null;
				Double confidence = null;
				if (candidate.place() != null) {
					ProviderPlace providerPlace = candidate.place();
					place = resolved.computeIfAbsent(providerPlace.providerPlaceId(),
							key -> placeResolver.resolve(PROVIDER, withRegion(providerPlace)));
					confidence = candidate.confidence();
				}
				candidates.add(new Candidate(UuidV7.generate(), candidate.name(), place, candidate.evidence(), confidence));
			}
		} catch (DataAccessException ex) {
			// 예외로 던지면 worker가 영구 실패로 처리한다. DB 일시 장애는 재시도한다(정책 E-14)
			return JobOutcome.failed(JobFailure.TEMPORARY_FAILURE);
		}
		return JobOutcome.succeeded(new StoredExtraction(parsed.get().resultStatus(), candidates).toJson(jsonMapper));
	}

	@Override
	public void complete(JobContext context, JsonNode result) {
		// 도메인 반영 없음. 후보는 저장·방문이 아니다. 선택한 후보는 사용자가 기존 저장 API로 저장한다
	}

	// 네이버 응답에는 지역 코드가 없어 주소로 찾는다. 못 찾으면 null이고, 이미 지역이 있는 장소는 PlaceResolver가 그 지역을 유지한다
	private ProviderPlace withRegion(ProviderPlace place) {
		return new ProviderPlace(place.providerPlaceId(), place.name(), place.address(), place.latitude(),
				place.longitude(), regionAddressMatcher.regionCode(place.address()), place.category());
	}

	static List<UUID> captureIds(JsonNode input) {
		List<UUID> ids = new ArrayList<>();
		JsonNode array = input.get("captureAssetIds");
		if (array != null && array.isArray()) {
			array.forEach(node -> ids.add(UUID.fromString(node.asString())));
		}
		return ids;
	}

	private static String nullableText(JsonNode node) {
		return node == null || node.isNull() ? null : node.asString();
	}

	private record AiCandidate(String name, ProviderPlace place, String evidence, Double confidence) {
	}

	// AI 응답 검사(정책 E-13). 최상위·후보 모양이 틀리면 전체 실패, 후보 안의 place만 틀리면 그 후보를 place:null로 바꾼다
	private record AiResult(ResultStatus resultStatus, List<AiCandidate> candidates) {

		static Optional<AiResult> parse(JsonNode data) {
			ResultStatus status;
			try {
				status = ResultStatus.valueOf(data.path("resultStatus").asString());
			} catch (RuntimeException ex) {
				return Optional.empty();
			}
			JsonNode items = data.get("candidates");
			if (items == null || !items.isArray() || items.size() > StoredExtraction.MAX_CANDIDATES) {
				return Optional.empty();
			}
			List<AiCandidate> candidates = new ArrayList<>();
			for (JsonNode item : items) {
				if (!item.isObject()) {
					return Optional.empty();
				}
				String name = text(item.get("name"), StoredExtraction.TEXT_MAX_LENGTH);
				String evidence = text(item.get("evidence"), StoredExtraction.TEXT_MAX_LENGTH);
				JsonNode confidenceNode = item.get("confidence");
				Double confidence = null;
				if (confidenceNode != null && !confidenceNode.isNull()) {
					if (!confidenceNode.isNumber()) {
						return Optional.empty();
					}
					confidence = confidenceNode.doubleValue();
					if (confidence < 0 || confidence > 1) {
						return Optional.empty();
					}
				}
				if (name == null || evidence == null) {
					return Optional.empty();
				}
				ProviderPlace place = providerPlace(item.get("place"));
				candidates.add(new AiCandidate(name, place, evidence, place == null ? null : confidence));
			}
			return Optional.of(new AiResult(status, candidates));
		}

		// places 제약(이름 255자, 주소 500자, 공급자 ID 255자, 좌표 범위)에 맞지 않으면 null
		private static ProviderPlace providerPlace(JsonNode node) {
			if (node == null || !node.isObject() || !node.path("provider").isString()
					|| !PROVIDER.equals(node.path("provider").asString())) {
				return null;
			}
			String name = text(node.get("name"), StoredExtraction.TEXT_MAX_LENGTH);
			String providerPlaceId = text(node.get("providerPlaceId"), StoredExtraction.TEXT_MAX_LENGTH);
			JsonNode addressNode = node.get("address");
			String address = null;
			if (addressNode != null && !addressNode.isNull()) {
				if (!addressNode.isString()) {
					return null;
				}
				address = addressNode.asString().strip();
				if (address.isEmpty()) {
					address = null;
				} else if (address.length() > ADDRESS_MAX_LENGTH) {
					return null;
				}
			}
			BigDecimal latitude = coordinate(node.get("latitude"), 90);
			BigDecimal longitude = coordinate(node.get("longitude"), 180);
			if (name == null || providerPlaceId == null || latitude == null || longitude == null) {
				return null;
			}
			// 네이버 분류(예: `여행,명소>해수욕장`). 날씨 대안의 실내·실외 판단에 쓴다. 형식이 맞지 않으면 버리고 장소는 살린다
			JsonNode categoryNode = node.get("category");
			String category = categoryNode != null && categoryNode.isString() ? categoryNode.asString() : null;
			return new ProviderPlace(providerPlaceId, name, address, latitude, longitude, null, category);
		}

		private static BigDecimal coordinate(JsonNode node, int limit) {
			if (node == null || !node.isNumber()) {
				return null;
			}
			BigDecimal value = node.decimalValue();
			return value.abs().compareTo(BigDecimal.valueOf(limit)) > 0 ? null : value;
		}

		private static String text(JsonNode node, int maxLength) {
			if (node == null || !node.isString()) {
				return null;
			}
			String value = node.asString().strip();
			return value.isEmpty() || value.length() > maxLength ? null : value;
		}

	}

}
