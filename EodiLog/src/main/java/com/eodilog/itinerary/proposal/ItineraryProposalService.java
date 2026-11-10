package com.eodilog.itinerary.proposal;

import com.fasterxml.jackson.annotation.JsonInclude;
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
import com.eodilog.weather.WeatherErrorCode;
import com.eodilog.weather.alternative.WeatherAccess;
import com.eodilog.weather.alternative.WeatherAlternativeResult;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
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
	private final WeatherAccess weatherAccess;

	// 같은 키 재요청 판정에 쓰는 정규화한 본문. WEATHER 필드는 null이면 빼서 INITIAL 지문이 이전과 같은 해시가 되게 한다
	record Fingerprint(String reason, long expectedVersion, String defaultTransportMode,
			@JsonInclude(JsonInclude.Include.NON_NULL) UUID sourceWeatherJobId,
			@JsonInclude(JsonInclude.Include.NON_NULL) UUID selectedAlternativeId,
			@JsonInclude(JsonInclude.Include.NON_NULL) List<UUID> excludedPlaceIds) {
	}

	// WEATHER 제안의 원본: 날씨 대안 작업의 기준 version, 날씨 날짜, 고른 대안
	private record SourceAlternative(long baseVersion, LocalDate date, JsonNode alternative) {
	}

	// 판정 순서(I-4): 키 형식 400 → 본문 400 → 비멤버 404 → 코스 version 409 → 기간·장소 없음 422 → 장소 수 422 → 등록
	// WEATHER(W-25): 키·본문 400 → 404 → 날씨 설정 OFF 409 → 원본 작업 404/409 → 없는 대안 400 → INFO 422
	// → version 409(요청 값·원본 기준 모두 현재와 같아야 함) → 기간 없음 422
	// → 여행 기간을 옮겨 대안의 날짜가 대상 일정의 일차와 달라졌으면 409 → 등록
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
				idempotencyKey, new Fingerprint(request.reason().name(), expectedVersion, mode.name(),
						request.sourceWeatherJobId(), request.selectedAlternativeId(), request.excludedPlaceIds()), JobRef.class,
				HttpStatus.ACCEPTED, () -> {
					// 코스를 쓰는 모든 경로가 여행 행을 먼저 잠그므로, 잠금 없이 읽어도 이 트랜잭션 동안 version이 바뀌지 않는다
					Itinerary itinerary = requireItinerary(tripId);
					ObjectNode input;
					if (request.reason() == ProposalReason.WEATHER) {
						if (weatherAccess.disabled(userId)) {
							throw new BusinessException(WeatherErrorCode.AI_FEATURE_DISABLED);
						}
						SourceAlternative source = sourceAlternative(tripId, request);
						// 대안을 만든 뒤 코스가 바뀌었으면(수동 수정·다른 적용) 오래된 대안이다
						if (itinerary.getVersion() != expectedVersion || source.baseVersion() != expectedVersion) {
							throw new BusinessException(ItineraryErrorCode.VERSION_CONFLICT);
						}
						input = weatherSnapshot(trip, itinerary, mode, source);
					} else {
						if (itinerary.getVersion() != expectedVersion) {
							throw new BusinessException(ItineraryErrorCode.VERSION_CONFLICT);
						}
						input = snapshot(trip, itinerary, mode);
                        if (request.reason() == ProposalReason.PLACE_REMOVED) {
                            Set<UUID> currentIds = new LinkedHashSet<>();
                            input.path("current").path("items").forEach(item -> currentIds.add(UUID.fromString(item.path("place").path("id").asString())));
							if (!currentIds.containsAll(request.excludedPlaceIds())) throw invalid("excludedPlaceIds", "현재 코스에 없는 장소입니다.");
                            input.put("reason", "PLACE_REMOVED");
                            input.set("excludedPlaceIds", jsonMapper.valueToTree(request.excludedPlaceIds()));
                            ArrayNode available = jsonMapper.createArrayNode();
                            input.path("places").forEach(place -> { if (!request.excludedPlaceIds().contains(UUID.fromString(place.path("id").asString()))) available.add(place); });
                            input.set("places", available);
                        }
					}
					return jobService.submit(new JobSubmission(userId, JobKind.ITINERARY_PROPOSAL, tripId, input,
							expectedVersion, null));
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

	// 판정 순서(I-17): 본문 400 → 여행 404 → 작업 404 → 이미 적용 409 → 성공 전 409 → version 409 → 기간 축소 409
	// → (WEATHER) 여행 시작일 이동 409 → 적용
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
		// 날씨 대안에서 온 제안은 적용하는 사람의 날씨 대안 설정도 본다(W-28)
		if (meta.reason() == ProposalReason.WEATHER && weatherAccess.disabled(userId)) {
			throw new BusinessException(WeatherErrorCode.AI_FEATURE_DISABLED);
		}
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
		// WEATHER 제안은 그날 날씨 기준이다. 제안 뒤 여행 시작일을 옮겼으면 다른 날짜가 되므로 오래된 제안이다
		if (meta.reason() == ProposalReason.WEATHER && (trip.getStartDate() == null
				|| !trip.getStartDate().toString().equals(meta.inputStartDate()))) {
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
				}
		if (request.expectedVersion() == null || request.expectedVersion() < 1) {
			errors.add(new ErrorField("expectedVersion", "조회한 코스의 version을 보내 주세요."));
		}
		if (request.reason() == ProposalReason.PLACE_REMOVED) {
            List<UUID> ids = request.excludedPlaceIds();
            if (ids == null || ids.isEmpty() || ids.contains(null) || new LinkedHashSet<>(ids).size() != ids.size())
                errors.add(new ErrorField("excludedPlaceIds", "중복 없는 현재 코스 장소 ID를 하나 이상 보내 주세요."));
        } else if (request.excludedPlaceIds() != null) {
			errors.add(new ErrorField("excludedPlaceIds", "INITIAL·WEATHER에는 보낼 수 없습니다."));
		}
		boolean weather = request.reason() == ProposalReason.WEATHER;
		if (weather && request.sourceWeatherJobId() == null) {
			errors.add(new ErrorField("sourceWeatherJobId", "날씨 대안 작업 ID를 보내 주세요."));
		} else if (!weather && request.sourceWeatherJobId() != null) {
			errors.add(new ErrorField("sourceWeatherJobId", "INITIAL에는 보낼 수 없습니다."));
		}
		if (weather && request.selectedAlternativeId() == null) {
			errors.add(new ErrorField("selectedAlternativeId", "고른 대안 ID를 보내 주세요."));
		} else if (!weather && request.selectedAlternativeId() != null) {
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
		return input(trip, itinerary, current, placeIds, mode, ProposalReason.INITIAL, null);
	}

	// WEATHER(W-26): 현재 코스 장소 + PLACE_SWAP 장소. AI는 고른 대안의 그날만 바꾼다
	private ObjectNode weatherSnapshot(Trip trip, Itinerary itinerary, TransportMode mode, SourceAlternative source) {
		if (trip.getStartDate() == null || trip.getEndDate() == null) {
			throw new BusinessException(ItineraryErrorCode.INSUFFICIENT_DATA,
					ItineraryErrorCode.INSUFFICIENT_DATA.message(),
					List.of(new ErrorField("trip.startDate", "여행 기간을 먼저 정해 주세요.")));
		}
		JsonNode alternative = source.alternative();
		CourseSnapshot current = courseWriter.capture(itinerary.getId());
		// 여행 기간 수정은 코스 version을 올리지 않는다. 날씨 날짜가 지금도 대상 일정의 일차인지 다시 본다
		long day = ChronoUnit.DAYS.between(trip.getStartDate(), source.date()) + 1;
		String itemId = alternative.path("itemId").asString("");
		if (current.items().stream().noneMatch(item -> item.id().toString().equals(itemId) && item.day() == day)) {
			throw new BusinessException(ItineraryErrorCode.VERSION_CONFLICT);
		}
		Set<UUID> placeIds = new LinkedHashSet<>();
		current.items().forEach(item -> placeIds.add(item.placeId()));
		JsonNode place = alternative.get("place");
		if (place != null && place.isObject()) {
			placeIds.add(UUID.fromString(place.get("id").asString()));
		}
		return input(trip, itinerary, current, placeIds, mode, ProposalReason.WEATHER, alternative);
	}

	// 같은 여행의 성공한 날씨 대안 작업과 고른 대안(W-25). 다른 여행·없는 작업은 404, 성공 전이면 409
	private SourceAlternative sourceAlternative(UUID tripId, ItineraryProposalRequest request) {
		List<Object[]> rows = jdbcTemplate.query("""
				select trip_id, status, base_version, result_json::text as result_json, input_json ->> 'date' as date
				from jobs where id = ? and kind = 'WEATHER_ALTERNATIVES' and deleted_at is null""",
				(rs, n) -> new Object[] {rs.getObject("trip_id", UUID.class), rs.getString("status"),
						rs.getObject("base_version", Long.class), rs.getString("result_json"), rs.getString("date")},
				request.sourceWeatherJobId());
		Object[] row = rows.stream().filter(found -> tripId.equals(found[0])).findFirst()
				.orElseThrow(() -> new BusinessException(JobErrorCode.JOB_NOT_FOUND));
		if (!JobStatus.SUCCEEDED.name().equals(row[1]) || row[3] == null || row[2] == null || row[4] == null) {
			throw new BusinessException(ItineraryErrorCode.PROPOSAL_NOT_READY);
		}
		JsonNode alternative = WeatherAlternativeResult.find(jsonMapper.readTree((String) row[3]),
				request.selectedAlternativeId())
				.orElseThrow(() -> invalid("selectedAlternativeId", "날씨 대안 결과에 없는 대안입니다."));
		if ("INFO".equals(alternative.path("type").asString(""))) {
			throw new BusinessException(ItineraryErrorCode.UNSCHEDULABLE_ALTERNATIVE);
		}
		return new SourceAlternative((Long) row[2], LocalDate.parse((String) row[4]), alternative.deepCopy());
	}

	// AI spec §5 요청 본문. 멤버 정보·메모는 넣지 않는다
	private ObjectNode input(Trip trip, Itinerary itinerary, CourseSnapshot current, Set<UUID> placeIds,
			TransportMode mode, ProposalReason reason, JsonNode selectedAlternative) {
		UUID tripId = trip.getId();
		Map<UUID, PlaceView> places = placeReader.findAll(placeIds);
        Map<UUID, String> categories = new java.util.HashMap<>();
        if (!placeIds.isEmpty()) new org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate(jdbcTemplate).query(
                "select id, category from places where id in (:ids)",
                new org.springframework.jdbc.core.namedparam.MapSqlParameterSource("ids", placeIds),
                (org.springframework.jdbc.core.RowCallbackHandler) rs -> categories.put(rs.getObject(1, UUID.class), rs.getString(2)));

		ObjectNode input = jsonMapper.createObjectNode();
		input.put("reason", reason.name());
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
				placeArray.add(aiPlace(place, categories));
			}
		}
		ObjectNode currentNode = input.putObject("current");
		ArrayNode items = currentNode.putArray("items");
		for (SnapshotItem item : current.items()) {
			ObjectNode node = items.addObject();
			node.put("id", item.id().toString());
			node.set("place", aiPlace(places.get(item.placeId()), categories));
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
		if (selectedAlternative == null) {
			input.putNull("selectedAlternative");
		} else {
			input.set("selectedAlternative", selectedAlternative);
		}
		return input;
	}

    private ObjectNode aiPlace(PlaceView place, Map<UUID, String> categories) {
        ObjectNode node = jsonMapper.valueToTree(place);
        node.put("category", categories.get(place.id()));
        return node;
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
				       input_json -> 'trip' ->> 'startDate' as start_date, result_json::text as result_json
				from jobs where id = ? and kind = 'ITINERARY_PROPOSAL' and deleted_at is null"""
				+ (forUpdate ? " for update" : ""),
				(rs, n) -> {
					Timestamp appliedAt = rs.getTimestamp("applied_at");
					String result = rs.getString("result_json");
					return new JobMeta(rs.getObject("trip_id", UUID.class), JobStatus.valueOf(rs.getString("status")),
							rs.getLong("base_version"), appliedAt == null ? null : appliedAt.toInstant(),
							ProposalReason.valueOf(rs.getString("reason")), rs.getString("start_date"),
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
			String inputStartDate, JsonNode result) {
	}

}
