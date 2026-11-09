package com.eodilog.itinerary.service;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.itinerary.domain.Itinerary;
import com.eodilog.itinerary.domain.ItineraryItem;
import com.eodilog.itinerary.domain.RouteLeg;
import com.eodilog.itinerary.domain.RouteLegStatus;
import com.eodilog.itinerary.domain.TransportMode;
import com.eodilog.itinerary.dto.ItineraryItemInput;
import com.eodilog.itinerary.dto.ItineraryResponse;
import com.eodilog.itinerary.dto.ItineraryUndoRequest;
import com.eodilog.itinerary.dto.ItineraryWriteRequest;
import com.eodilog.itinerary.dto.RouteLegInput;
import com.eodilog.itinerary.exception.ItineraryErrorCode;
import com.eodilog.itinerary.repository.ItineraryItemRepository;
import com.eodilog.itinerary.repository.ItineraryRepository;
import com.eodilog.itinerary.repository.RouteLegRepository;
import com.eodilog.itinerary.service.CourseWriter.CourseItem;
import com.eodilog.itinerary.service.CourseWriter.CourseLeg;
import com.eodilog.place.service.PlaceReader;
import com.eodilog.trip.domain.Trip;
import com.eodilog.trip.service.TripAccess;
import com.eodilog.trip.service.TripAccessChecker;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 여행별 단일 코스 조회·전체 교체(명세 §6, 정책 §13-3). ACTIVE 멤버 누구나 보고 고친다. 승인·확정 단계는 없다
// 판정 순서: 입력 400 → 구간 422 → 여행 404 → 코스 version 409 → 코스 소유·여행 기간 400 → 처리
// 경로 공급자가 정해지기 전이라 구간은 이동 수단만 저장하고 시간·거리·지도선은 비운다(C-5)
@Service
@RequiredArgsConstructor
public class ItineraryService {

	public static final int MAX_ITEMS = 200;
	public static final int MAX_STAY_MINUTES = 1440;

	private static final Pattern START_TIME = Pattern.compile("^([01][0-9]|2[0-3]):[0-5][0-9]$");

	private final ItineraryRepository itineraryRepository;
	private final ItineraryItemRepository itineraryItemRepository;
	private final RouteLegRepository routeLegRepository;
	private final ItineraryResponseAssembler itineraryResponseAssembler;
	private final TripAccessChecker tripAccessChecker;
	private final ItineraryNotifier itineraryNotifier;
	private final PlaceReader placeReader;
	private final CourseWriter courseWriter;
	private final ItineraryUndoStore itineraryUndoStore;
	private final Clock clock;

	@Transactional(readOnly = true)
	public ItineraryResponse getItinerary(UUID userId, UUID tripId) {
		tripAccessChecker.requireActiveMember(tripId, userId);
		return itineraryResponseAssembler.assemble(requireItinerary(tripId));
	}

	// 전체 교체. 요청에 없는 기존 항목은 지우고, id를 보낸 항목은 유지하며, 새 항목은 서버가 id를 발급한다(C-2)
	// 바뀐 게 없으면 version을 올리지 않는다(C-6, 여행 수정 P-8과 같은 규칙). 잠금은 여행 행 → 코스 행 순서다
	@Transactional
	public ItineraryResponse replaceItinerary(UUID userId, UUID tripId, ItineraryWriteRequest request) {
		Draft draft = validate(request);
		TripAccess access = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId);
		Itinerary itinerary = itineraryRepository.findByTripIdForUpdate(tripId)
				.orElseThrow(() -> new IllegalStateException("코스가 없는 여행입니다: " + tripId));
		if (itinerary.getVersion() != draft.expectedVersion()) {
			throw new BusinessException(ItineraryErrorCode.VERSION_CONFLICT);
		}
		List<ItineraryItem> existing = itineraryItemRepository
				.findAllByItineraryIdOrderByDayAscSequenceAsc(itinerary.getId());
		Map<UUID, ItineraryItem> existingById = existing.stream()
				.collect(Collectors.toMap(ItineraryItem::getId, Function.identity()));
		validateAgainstTrip(draft, access.trip(), existingById.keySet());

		List<RouteLeg> existingLegs = routeLegRepository.findAllByItineraryId(itinerary.getId());
		if (unchanged(draft, existing, existingById, existingLegs)) {
			return itineraryResponseAssembler.assemble(itinerary);
		}

		Instant now = now();
		courseWriter.replace(itinerary, existing,
				draft.items().stream().map(item -> new CourseItem(item.id(), item.placeId(), item.day(), item.order(),
						item.startTime(), item.stayMinutes())).toList(),
				draft.legs().stream().map(leg -> new CourseLeg(leg.day(), leg.fromOrder(), leg.toOrder(),
						leg.transportMode(), null, null, RouteLegStatus.UNAVAILABLE, now)).toList());
		// 다른 쓰기가 생겼으니 직전 AI 적용은 더 이상 되돌릴 수 없다(정책 I-27). version 비교로도 막히지만 옛 스냅샷을 남기지 않는다
		itineraryUndoStore.delete(itinerary.getId());
		itinerary.markReplaced(access.member().getId(), now);
		itineraryNotifier.courseChanged(itinerary, userId);
		return itineraryResponseAssembler.assemble(itinerary);
	}

	// 직전 AI 적용 1회 되돌리기(명세 §6, 정책 I-21~I-24). ACTIVE 멤버 누구나, 시간 제한 없이(Q-15 미정) 다른 쓰기 전까지만
	// 판정 순서: 입력 400 → 여행 404 → 코스 version 409 VERSION_CONFLICT → 되돌릴 적용이 아님 409 UNDO_UNAVAILABLE → 복원
	@Transactional
	public ItineraryResponse undo(UUID userId, UUID tripId, ItineraryUndoRequest request) {
		List<ErrorField> errors = new ArrayList<>();
		if (request.expectedVersion() == null) {
			errors.add(new ErrorField("expectedVersion", "조회한 코스의 version을 보내 주세요."));
		}
		if (request.appliedJobId() == null) {
			errors.add(new ErrorField("appliedJobId", "되돌릴 AI 제안의 작업 ID를 보내 주세요."));
		}
		throwIfInvalid(errors);
		TripAccess access = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId);
		Itinerary itinerary = itineraryRepository.findByTripIdForUpdate(tripId)
				.orElseThrow(() -> new IllegalStateException("코스가 없는 여행입니다: " + tripId));
		if (itinerary.getVersion() != request.expectedVersion()) {
			throw new BusinessException(ItineraryErrorCode.VERSION_CONFLICT);
		}
		ItineraryUndoStore.UndoState state = itineraryUndoStore.find(itinerary.getId())
				.filter(found -> found.appliedJobId().equals(request.appliedJobId())
						&& found.appliedVersion() == itinerary.getVersion())
				.orElseThrow(() -> new BusinessException(ItineraryErrorCode.UNDO_UNAVAILABLE));

		itinerary.markReplaced(access.member().getId(), now());
		itineraryUndoStore.delete(itinerary.getId());
		// restore가 영속성 컨텍스트를 비우므로 version 증가를 먼저 반영해 둔다
		courseWriter.restore(itinerary.getId(), state.before());
		itineraryNotifier.courseChanged(itinerary, userId);
		return itineraryResponseAssembler.assemble(itinerary);
	}

	private Itinerary requireItinerary(UUID tripId) {
		// 여행 생성 때 ItineraryInitializer가 함께 만들므로 없으면 자료 오류다
		return itineraryRepository.findByTripId(tripId)
				.orElseThrow(() -> new IllegalStateException("코스가 없는 여행입니다: " + tripId));
	}

	// 요청만으로 알 수 있는 오류를 한 번에 알린다. 장소 존재 확인까지 입력 검증이다(C-3)
	private Draft validate(ItineraryWriteRequest request) {
		List<ErrorField> errors = new ArrayList<>();
		if (request.expectedVersion() == null) {
			errors.add(new ErrorField("expectedVersion", "조회한 코스의 version을 보내 주세요."));
		}
		List<DraftItem> items = validateItems(request.items(), errors);
		List<DraftLeg> legs = validateLegs(request.legs(), errors);
		throwIfInvalid(errors);
		validateLegStructure(items, legs);
		return new Draft(request.expectedVersion(), items, legs);
	}

	private List<DraftItem> validateItems(List<ItineraryItemInput> inputs, List<ErrorField> errors) {
		if (inputs == null) {
			errors.add(new ErrorField("items", "코스 항목 목록을 보내 주세요. 비우려면 빈 배열([])을 보내 주세요."));
			return List.of();
		}
		if (inputs.size() > MAX_ITEMS) {
			errors.add(new ErrorField("items", "코스 항목은 " + MAX_ITEMS + "개까지 넣을 수 있습니다."));
			return List.of();
		}
		int errorCount = errors.size();
		List<DraftItem> items = new ArrayList<>();
		Set<UUID> ids = new HashSet<>();
		for (int i = 0; i < inputs.size(); i++) {
			ItineraryItemInput input = inputs.get(i);
			String field = "items[" + i + "]";
			if (input == null) {
				errors.add(new ErrorField(field, "항목이 비어 있습니다."));
				continue;
			}
			int before = errors.size();
			if (input.id() != null && !ids.add(input.id())) {
				errors.add(new ErrorField(field + ".id", "같은 항목 ID를 두 번 보낼 수 없습니다."));
			}
			if (input.placeId() == null) {
				errors.add(new ErrorField(field + ".placeId", "장소 ID를 보내 주세요."));
			}
			if (input.day() == null || input.day() < 1) {
				errors.add(new ErrorField(field + ".day", "day는 1 이상이어야 합니다."));
			}
			if (input.order() == null || input.order() < 1) {
				errors.add(new ErrorField(field + ".order", "order는 1 이상이어야 합니다."));
			}
			if (input.startTime() != null && !START_TIME.matcher(input.startTime()).matches()) {
				errors.add(new ErrorField(field + ".startTime", "시각은 HH:mm(00:00~23:59) 형식으로 보내 주세요."));
			}
			if (input.stayMinutes() != null && (input.stayMinutes() < 1 || input.stayMinutes() > MAX_STAY_MINUTES)) {
				errors.add(new ErrorField(field + ".stayMinutes", "머무는 시간은 1~" + MAX_STAY_MINUTES + "분이어야 합니다."));
			}
			// 오류가 있는 항목은 값이 비어 있을 수 있어 초안으로 만들지 않는다(아래에서 전체를 버린다)
			if (errors.size() == before) {
				items.add(new DraftItem(input.id(), input.placeId(), input.day(), input.order(), input.startTime(),
						input.stayMinutes()));
			}
		}
		if (errors.size() > errorCount) {
			return List.of();
		}

		// 날짜별 order는 1부터 빈틈없이 이어진다(C-3)
		Map<Integer, List<Integer>> ordersByDay = items.stream().collect(Collectors.groupingBy(DraftItem::day,
				TreeMap::new, Collectors.mapping(DraftItem::order, Collectors.toList())));
		ordersByDay.forEach((day, orders) -> {
			List<Integer> sorted = orders.stream().sorted().toList();
			for (int k = 0; k < sorted.size(); k++) {
				if (sorted.get(k) != k + 1) {
					errors.add(new ErrorField("items", day + "일차의 order는 1부터 빈틈없이 이어져야 합니다."));
					break;
				}
			}
		});

		// 장소는 PlaceReader로 존재만 확인한다. 없는 ID는 다른 자원을 가리키는 입력이라 400이다(C-3)
		List<UUID> placeIds = items.stream().map(DraftItem::placeId).distinct().toList();
		Set<UUID> found = placeIds.isEmpty() ? Set.of() : placeReader.findAll(placeIds).keySet();
		for (int i = 0; i < items.size(); i++) {
			if (!found.contains(items.get(i).placeId())) {
				errors.add(new ErrorField("items[" + i + "].placeId", "존재하지 않는 장소입니다."));
			}
		}
		return items;
	}

	private List<DraftLeg> validateLegs(List<RouteLegInput> inputs, List<ErrorField> errors) {
		if (inputs == null) {
			errors.add(new ErrorField("legs", "구간 목록을 보내 주세요. 구간이 없으면 빈 배열([])을 보내 주세요."));
			return List.of();
		}
		List<DraftLeg> legs = new ArrayList<>();
		for (int i = 0; i < inputs.size(); i++) {
			RouteLegInput input = inputs.get(i);
			String field = "legs[" + i + "]";
			if (input == null) {
				errors.add(new ErrorField(field, "구간이 비어 있습니다."));
				continue;
			}
			int before = errors.size();
			if (input.day() == null || input.day() < 1) {
				errors.add(new ErrorField(field + ".day", "day는 1 이상이어야 합니다."));
			}
			if (input.fromOrder() == null || input.fromOrder() < 1) {
				errors.add(new ErrorField(field + ".fromOrder", "fromOrder는 1 이상이어야 합니다."));
			}
			if (input.toOrder() == null || input.toOrder() < 1) {
				errors.add(new ErrorField(field + ".toOrder", "toOrder는 1 이상이어야 합니다."));
			}
			if (input.transportMode() == null) {
				errors.add(new ErrorField(field + ".transportMode", "이동 수단(WALK, CAR, TRANSIT)을 골라 주세요."));
			}
			if (errors.size() == before) {
				legs.add(new DraftLeg(input.day(), input.fromOrder(), input.toOrder(), input.transportMode()));
			}
		}
		return legs;
	}

	// 같은 날짜의 연속 인접 쌍마다 구간이 정확히 하나여야 한다. 빠지거나 겹치거나 인접하지 않으면 422(C-4)
	private void validateLegStructure(List<DraftItem> items, List<DraftLeg> legs) {
		Map<Integer, Integer> countByDay = items.stream()
				.collect(Collectors.groupingBy(DraftItem::day, TreeMap::new, Collectors.summingInt(item -> 1)));
		Set<DayPair> expected = new LinkedHashSet<>();
		countByDay.forEach((day, count) -> {
			for (int order = 1; order < count; order++) {
				expected.add(new DayPair(day, order, order + 1));
			}
		});
		List<ErrorField> errors = new ArrayList<>();
		Set<DayPair> seen = new HashSet<>();
		for (int i = 0; i < legs.size(); i++) {
			DraftLeg leg = legs.get(i);
			DayPair pair = new DayPair(leg.day(), leg.fromOrder(), leg.toOrder());
			if (!expected.contains(pair)) {
				errors.add(new ErrorField("legs[" + i + "]", "같은 날짜의 인접한 두 항목(order n → n+1)을 잇는 구간이 아닙니다."));
			} else if (!seen.add(pair)) {
				errors.add(new ErrorField("legs[" + i + "]", "같은 구간을 두 번 보낼 수 없습니다."));
			}
		}
		for (DayPair pair : expected) {
			if (!seen.contains(pair)) {
				errors.add(new ErrorField("legs", pair.day() + "일차 " + pair.fromOrder() + "→" + pair.toOrder()
						+ " 구간이 없습니다."));
			}
		}
		if (!errors.isEmpty()) {
			throw new BusinessException(ItineraryErrorCode.INVALID_ROUTE_LEGS,
					ItineraryErrorCode.INVALID_ROUTE_LEGS.message(), errors);
		}
	}

	// 코스를 잠근 뒤에만 알 수 있는 입력 오류. 기존 id는 이 코스 소유여야 하고(C-2), 여행 기간이 있으면 day는 일수 이하다(C-3)
	private void validateAgainstTrip(Draft draft, Trip trip, Set<UUID> existingIds) {
		Long tripDays = trip.getStartDate() == null || trip.getEndDate() == null ? null
				: ChronoUnit.DAYS.between(trip.getStartDate(), trip.getEndDate()) + 1;
		List<ErrorField> errors = new ArrayList<>();
		for (int i = 0; i < draft.items().size(); i++) {
			DraftItem item = draft.items().get(i);
			if (item.id() != null && !existingIds.contains(item.id())) {
				errors.add(new ErrorField("items[" + i + "].id", "이 코스의 항목이 아닙니다. 새 항목이면 id를 빼고 보내 주세요."));
			}
			if (tripDays != null && item.day() > tripDays) {
				errors.add(new ErrorField("items[" + i + "].day", "여행 기간(" + tripDays + "일)을 넘는 날짜입니다."));
			}
		}
		throwIfInvalid(errors);
	}

	// 모든 항목이 id로 유지되고 내용·구간이 같으면 바뀐 게 없다. 새 항목(id 없음)이 하나라도 있으면 변경이다
	private boolean unchanged(Draft draft, List<ItineraryItem> existing, Map<UUID, ItineraryItem> existingById,
			List<RouteLeg> existingLegs) {
		if (draft.items().size() != existing.size() || draft.legs().size() != existingLegs.size()) {
			return false;
		}
		Map<DayOrder, UUID> itemIdByPosition = new HashMap<>();
		for (DraftItem item : draft.items()) {
			if (item.id() == null) {
				return false;
			}
			ItineraryItem current = existingById.get(item.id());
			if (!current.sameAs(item.placeId(), item.day(), item.order(), item.startTime(), item.stayMinutes())) {
				return false;
			}
			itemIdByPosition.put(new DayOrder(item.day(), item.order()), item.id());
		}
		Set<LegKey> currentLegs = existingLegs.stream()
				.map(leg -> new LegKey(leg.getFromItemId(), leg.getToItemId(), leg.getTransportMode()))
				.collect(Collectors.toSet());
		Set<LegKey> requestedLegs = draft.legs().stream()
				.map(leg -> new LegKey(itemIdByPosition.get(new DayOrder(leg.day(), leg.fromOrder())),
						itemIdByPosition.get(new DayOrder(leg.day(), leg.toOrder())), leg.transportMode()))
				.collect(Collectors.toSet());
		return currentLegs.equals(requestedLegs);
	}

	private void throwIfInvalid(List<ErrorField> errors) {
		if (!errors.isEmpty()) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
					List.copyOf(errors));
		}
	}

	private Instant now() {
		return clock.instant().truncatedTo(ChronoUnit.MICROS);
	}

	private record Draft(long expectedVersion, List<DraftItem> items, List<DraftLeg> legs) {
	}

	private record DraftItem(UUID id, UUID placeId, int day, int order, String startTime, Integer stayMinutes) {
	}

	private record DraftLeg(int day, int fromOrder, int toOrder, TransportMode transportMode) {
	}

	private record DayOrder(int day, int order) {
	}

	private record DayPair(int day, int fromOrder, int toOrder) {
	}

	private record LegKey(UUID fromItemId, UUID toItemId, TransportMode transportMode) {
	}

}
