package com.eodilog.itinerary.proposal;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.itinerary.domain.Itinerary;
import com.eodilog.itinerary.domain.ItineraryItem;
import com.eodilog.itinerary.domain.TransportMode;
import com.eodilog.itinerary.dto.ItineraryResponse;
import com.eodilog.itinerary.exception.ItineraryErrorCode;
import com.eodilog.itinerary.proposal.ItineraryProposalResponse.ProposalDiff;
import com.eodilog.itinerary.repository.ItineraryItemRepository;
import com.eodilog.itinerary.repository.ItineraryRepository;
import com.eodilog.itinerary.service.CourseWriter;
import com.eodilog.itinerary.service.CourseWriter.CourseItem;
import com.eodilog.itinerary.service.CourseWriter.CourseLeg;
import com.eodilog.itinerary.service.CourseWriter.CourseSnapshot;
import com.eodilog.itinerary.service.CourseWriter.SnapshotItem;
import com.eodilog.itinerary.service.CourseWriter.SnapshotLeg;
import com.eodilog.itinerary.service.ItineraryNotifier;
import com.eodilog.itinerary.service.ItineraryResponseAssembler;
import com.eodilog.itinerary.service.ItineraryUndoStore;
import com.eodilog.job.Job;
import com.eodilog.job.JobErrorCode;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobRef;
import com.eodilog.job.JobService;
import com.eodilog.job.JobStatus;
import com.eodilog.job.JobSubmission;
import com.eodilog.place.dto.PlaceView;
import com.eodilog.place.service.PlaceReader;
import com.eodilog.trip.domain.Trip;
import com.eodilog.trip.service.TripAccess;
import com.eodilog.trip.service.TripAccessChecker;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

// AI 코스 제안 요청·조회·적용(명세 §6, 정책 I-1~I-20). 제안만 만들고 코스는 사용자의 apply에서만 바뀐다
// 되돌리기는 코스 쪽(ItineraryService.undo)에 있다
@Service
@RequiredArgsConstructor
public class ItineraryProposalService {

	// 코스 항목 상한과 같다(I-6)
	static final int MAX_PLACES = 200;

	private final IdempotencyService idempotencyService;
	private final TripAccessChecker tripAccessChecker;
	private final ItineraryRepository itineraryRepository;
	private final ItineraryItemRepository itineraryItemRepository;
	private final ItineraryResponseAssembler itineraryResponseAssembler;
	private final ItineraryNotifier itineraryNotifier;
	private final ItineraryUndoStore itineraryUndoStore;
	private final CourseWriter courseWriter;
	private final PlaceReader placeReader;
	private final JobService jobService;
	private final JdbcTemplate jdbcTemplate;
	private final JsonMapper jsonMapper;
	private final Clock clock;

	// 같은 키 재요청 판정에 쓰는 정규화한 본문
	record Fingerprint(String reason, long expectedVersion, String defaultTransportMode) {
	}

	// 판정 순서(I-4): 키 형식 400 → 본문 400 → 비멤버 404 → 코스 version 409 → 기간·장소 없음 422 → 장소 수 422 → 등록
	// 같은 키 재요청은 처음 JobRef를 돌려준다. version·장소 검사는 처음 등록할 때만 한다
	@Transactional
	public JobRef request(UUID userId, UUID tripId, String idempotencyKey, ItineraryProposalRequest request) {
		idempotencyService.validateKey(idempotencyKey);
		validate(request);
		TransportMode mode = request.defaultTransportMode() == null ? TransportMode.TRANSIT
				: request.defaultTransportMode();
		long expectedVersion = request.expectedVersion();
		Trip trip = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId).trip();
		return idempotencyService.execute(userId, "POST /api/v1/trips/" + tripId + "/itinerary/proposals",
				idempotencyKey, new Fingerprint(request.reason().name(), expectedVersion, mode.name()), JobRef.class,
				HttpStatus.ACCEPTED, () -> {
					// 코스를 쓰는 모든 경로가 여행 행을 먼저 잠그므로, 잠금 없이 읽어도 이 트랜잭션 동안 version이 바뀌지 않는다
					Itinerary itinerary = requireItinerary(tripId);
					if (itinerary.getVersion() != expectedVersion) {
						throw new BusinessException(ItineraryErrorCode.VERSION_CONFLICT);
					}
					return jobService.submit(new JobSubmission(userId, JobKind.ITINERARY_PROPOSAL, tripId,
							snapshot(trip, itinerary, mode), expectedVersion, null));
				});
	}

	// 진행 중·실패·취소면 proposed=null·빈 diff. 사유는 job.error. 다른 여행·다른 종류·볼 수 없는 작업은 404
	@Transactional(readOnly = true)
	public ItineraryProposalResponse get(UUID viewerId, UUID tripId, UUID jobId) {
		Job job = jobService.get(viewerId, jobId);
		JobMeta meta = job.kind() == JobKind.ITINERARY_PROPOSAL ? findMeta(jobId, false).orElse(null) : null;
		if (meta == null || !tripId.equals(meta.tripId())) {
			throw new BusinessException(JobErrorCode.JOB_NOT_FOUND);
		}
		Optional<StoredProposal> proposal = job.result() == null ? Optional.empty()
				: Optional.of(StoredProposal.parseStored(job.result(), jsonMapper)
						.orElseThrow(() -> new IllegalStateException("Invalid stored itinerary proposal")));
		boolean canUndo = false;
		if (meta.appliedAt() != null) {
			Itinerary itinerary = requireItinerary(tripId);
			canUndo = itineraryUndoStore.canUndo(itinerary.getId(), jobId, itinerary.getVersion());
		}
		return new ItineraryProposalResponse(job, meta.baseVersion(), meta.reason(),
				proposal.map(StoredProposal::toCourse).orElse(null),
				proposal.map(StoredProposal::diff).orElse(ProposalDiff.EMPTY), meta.appliedAt(), canUndo);
	}

	// 판정 순서(I-17): 본문 400 → 여행 404 → 작업 404 → 이미 적용 409 → 성공 전 409 → version 409 → 기간 축소 409 → 적용
	// 잠금 순서는 여행 → 코스 → 작업 행이다. worker의 완료 처리는 작업 행만 잠그고 여행·코스는 잠그지 않아 교착이 없다
	@Transactional
	public ItineraryResponse apply(UUID userId, UUID tripId, UUID jobId, ItineraryProposalApplyRequest request) {
		if (request.expectedVersion() == null) {
			throw invalid("expectedVersion", "조회한 코스의 version을 보내 주세요.");
		}
		TripAccess access = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId);
		Itinerary itinerary = itineraryRepository.findByTripIdForUpdate(tripId)
				.orElseThrow(() -> new IllegalStateException("코스가 없는 여행입니다: " + tripId));
		JobMeta meta = findMeta(jobId, true).filter(found -> tripId.equals(found.tripId()))
				.orElseThrow(() -> new BusinessException(JobErrorCode.JOB_NOT_FOUND));
		if (meta.appliedAt() != null) {
			throw new BusinessException(ItineraryErrorCode.ALREADY_APPLIED);
		}
		if (meta.status() != JobStatus.SUCCEEDED || meta.result() == null) {
			throw new BusinessException(ItineraryErrorCode.PROPOSAL_NOT_READY);
		}
		if (itinerary.getVersion() != request.expectedVersion() || itinerary.getVersion() != meta.baseVersion()) {
			throw new BusinessException(ItineraryErrorCode.VERSION_CONFLICT);
		}
		StoredProposal proposal = StoredProposal.parseStored(meta.result(), jsonMapper)
				.orElseThrow(() -> new IllegalStateException("Invalid stored itinerary proposal: " + jobId));
		Trip trip = access.trip();
		Long tripDays = trip.getStartDate() == null || trip.getEndDate() == null ? null
				: ChronoUnit.DAYS.between(trip.getStartDate(), trip.getEndDate()) + 1;
		// 제안 뒤 여행 기간이 줄었으면 오래된 제안이다. 여행 기간을 지운 경우는 PUT과 같이 일수 제한이 없다
		if (tripDays != null && proposal.items().stream().anyMatch(item -> item.day() > tripDays)) {
			throw new BusinessException(ItineraryErrorCode.VERSION_CONFLICT);
		}

		Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
		UUID memberId = access.member().getId();
		CourseSnapshot before = courseWriter.capture(itinerary.getId());
		List<ItineraryItem> existing = itineraryItemRepository
				.findAllByItineraryIdOrderByDayAscSequenceAsc(itinerary.getId());
		courseWriter.replace(itinerary, existing,
				proposal.items().stream().map(item -> new CourseItem(item.id(), item.place().id(), item.day(),
						item.order(), item.startTime(), item.stayMinutes())).toList(),
				proposal.legs().stream().map(leg -> new CourseLeg(leg.day(), leg.fromOrder(), leg.toOrder(),
						leg.transportMode(), leg.durationSeconds(), null, leg.status(), leg.queriedAt())).toList());
		// 내용이 같아도 version을 올린다. 적용 기록과 되돌릴 대상이 있어야 하기 때문이다(I-19)
		itinerary.markReplaced(memberId, now);
		itineraryUndoStore.save(itinerary.getId(), jobId, itinerary.getVersion(), before, memberId, now);
		jdbcTemplate.update("update jobs set applied_at = ?, applied_by_member_id = ? where id = ?",
				Timestamp.from(now), memberId, jobId);
		itineraryNotifier.courseChanged(itinerary, userId);
		return itineraryResponseAssembler.assemble(itinerary);
	}

	private void validate(ItineraryProposalRequest request) {
		List<ErrorField> errors = new ArrayList<>();
		if (request.reason() == null) {
			errors.add(new ErrorField("reason", "제안 사유를 보내 주세요."));
		} else if (request.reason() != ProposalReason.INITIAL) {
			errors.add(new ErrorField("reason", "아직 지원하지 않는 사유입니다. 지금은 INITIAL만 보낼 수 있습니다."));
		}
		if (request.expectedVersion() == null || request.expectedVersion() < 1) {
			errors.add(new ErrorField("expectedVersion", "조회한 코스의 version을 보내 주세요."));
		}
		if (request.excludedPlaceIds() != null) {
			errors.add(new ErrorField("excludedPlaceIds", "INITIAL에는 보낼 수 없습니다."));
		}
		if (request.sourceWeatherJobId() != null) {
			errors.add(new ErrorField("sourceWeatherJobId", "INITIAL에는 보낼 수 없습니다."));
		}
		if (request.selectedAlternativeId() != null) {
			errors.add(new ErrorField("selectedAlternativeId", "INITIAL에는 보낼 수 없습니다."));
		}
		if (!errors.isEmpty()) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
					List.copyOf(errors));
		}
	}

	// 등록 시점의 입력을 고정한다(I-8). AI 요청 본문(AI spec §5)과 같은 모양이라 실행기가 그대로 보낸다
	// 멤버 정보·메모는 넣지 않는다
	private ObjectNode snapshot(Trip trip, Itinerary itinerary, TransportMode mode) {
		UUID tripId = trip.getId();
		CourseSnapshot current = courseWriter.capture(itinerary.getId());
		// 대상 장소: 여행에 모은 장소(저장 순, 나간 멤버의 저장 포함) + 현재 코스 장소(I-6)
		Set<UUID> placeIds = new LinkedHashSet<>(jdbcTemplate.queryForList("""
				select place_id from trip_place_saves where trip_id = ?
				group by place_id order by min(created_at), place_id""", UUID.class, tripId));
		current.items().forEach(item -> placeIds.add(item.placeId()));

		List<ErrorField> missing = new ArrayList<>();
		if (trip.getStartDate() == null || trip.getEndDate() == null) {
			missing.add(new ErrorField("trip.startDate", "여행 기간을 먼저 정해 주세요."));
		}
		if (placeIds.isEmpty()) {
			missing.add(new ErrorField("places", "코스에 넣을 장소를 먼저 모아 주세요."));
		}
		if (!missing.isEmpty()) {
			throw new BusinessException(ItineraryErrorCode.INSUFFICIENT_DATA,
					ItineraryErrorCode.INSUFFICIENT_DATA.message(), List.copyOf(missing));
		}
		if (placeIds.size() > MAX_PLACES) {
			throw new BusinessException(ItineraryErrorCode.INPUT_LIMIT_EXCEEDED);
		}
		Map<UUID, PlaceView> places = placeReader.findAll(placeIds);

		ObjectNode input = jsonMapper.createObjectNode();
		input.put("reason", ProposalReason.INITIAL.name());
		input.put("expectedVersion", itinerary.getVersion());
		ObjectNode tripNode = input.putObject("trip");
		tripNode.put("id", tripId.toString());
		tripNode.put("startDate", trip.getStartDate().toString());
		tripNode.put("endDate", trip.getEndDate().toString());
		ArrayNode regions = tripNode.putArray("destinationRegionIds");
		jdbcTemplate.queryForList("select region_id from trip_destinations where trip_id = ? order by display_order",
				UUID.class, tripId).forEach(id -> regions.add(id.toString()));

		ArrayNode placeArray = input.putArray("places");
		for (UUID placeId : placeIds) {
			PlaceView place = places.get(placeId);
			if (place != null) {
				placeArray.add(jsonMapper.<JsonNode>valueToTree(place));
			}
		}
		ObjectNode currentNode = input.putObject("current");
		ArrayNode items = currentNode.putArray("items");
		for (SnapshotItem item : current.items()) {
			ObjectNode node = items.addObject();
			node.put("id", item.id().toString());
			node.set("place", jsonMapper.valueToTree(places.get(item.placeId())));
			node.put("day", item.day());
			node.put("order", item.order());
			node.put("startTime", item.startTime());
			if (item.stayMinutes() == null) {
				node.putNull("stayMinutes");
			} else {
				node.put("stayMinutes", item.stayMinutes());
			}
		}
		ArrayNode legs = currentNode.putArray("legs");
		for (SnapshotLeg leg : current.legs()) {
			ObjectNode node = legs.addObject();
			node.put("fromItemId", leg.fromItemId().toString());
			node.put("toItemId", leg.toItemId().toString());
			node.put("transportMode", leg.transportMode().name());
			if (leg.durationSeconds() == null) {
				node.putNull("durationSeconds");
			} else {
				node.put("durationSeconds", leg.durationSeconds());
			}
			if (leg.distanceMeters() == null) {
				node.putNull("distanceMeters");
			} else {
				node.put("distanceMeters", leg.distanceMeters());
			}
			if (leg.geometryJson() == null) {
				node.putNull("geometry");
			} else {
				node.set("geometry", jsonMapper.readTree(leg.geometryJson()));
			}
			node.put("status", leg.status().name());
			node.put("queriedAt", leg.queriedAt().toString());
		}
		input.put("defaultTransportMode", mode.name());
		input.putArray("excludedPlaceIds");
		input.putNull("selectedAlternative");
		return input;
	}

	private Itinerary requireItinerary(UUID tripId) {
		// 여행 생성 때 ItineraryInitializer가 함께 만들므로 없으면 자료 오류다
		return itineraryRepository.findByTripId(tripId)
				.orElseThrow(() -> new IllegalStateException("코스가 없는 여행입니다: " + tripId));
	}

	// 공통 Job 응답에 없는 작업 행 값. 지운 작업은 없는 것으로 본다
	private Optional<JobMeta> findMeta(UUID jobId, boolean forUpdate) {
		List<JobMeta> rows = jdbcTemplate.query("""
				select trip_id, status, base_version, applied_at, input_json ->> 'reason' as reason,
				       result_json::text as result_json
				from jobs where id = ? and kind = 'ITINERARY_PROPOSAL' and deleted_at is null"""
				+ (forUpdate ? " for update" : ""),
				(rs, n) -> {
					Timestamp appliedAt = rs.getTimestamp("applied_at");
					String result = rs.getString("result_json");
					return new JobMeta(rs.getObject("trip_id", UUID.class), JobStatus.valueOf(rs.getString("status")),
							rs.getLong("base_version"), appliedAt == null ? null : appliedAt.toInstant(),
							ProposalReason.valueOf(rs.getString("reason")),
							result == null ? null : jsonMapper.readTree(result));
				},
				jobId);
		return rows.stream().findFirst();
	}

	private static BusinessException invalid(String field, String message) {
		return new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
				List.of(new ErrorField(field, message)));
	}

	private record JobMeta(UUID tripId, JobStatus status, long baseVersion, Instant appliedAt, ProposalReason reason,
			JsonNode result) {
	}

}
