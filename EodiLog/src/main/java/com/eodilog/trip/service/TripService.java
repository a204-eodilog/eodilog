package com.eodilog.trip.service;

import com.eodilog.chat.service.ChatRoomInitializer;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.itinerary.service.ItineraryInitializer;
import com.eodilog.region.repository.RegionRepository;
import com.eodilog.trip.domain.Trip;
import com.eodilog.trip.domain.TripDestination;
import com.eodilog.trip.domain.TripInfoChangedEvent;
import com.eodilog.trip.domain.TripMember;
import com.eodilog.trip.domain.TripStatus;
import com.eodilog.trip.domain.TripStatusPolicy;
import com.eodilog.trip.dto.CreateTripRequest;
import com.eodilog.trip.dto.TripResponse;
import com.eodilog.trip.dto.UpdateTripRequest;
import com.eodilog.trip.exception.TripErrorCode;
import com.eodilog.trip.repository.TripDestinationRepository;
import com.eodilog.trip.repository.TripMemberRepository;
import com.eodilog.trip.repository.TripRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class TripService {

	static final String CREATE_SCOPE = "POST /api/v1/trips";

	private static final int TITLE_MAX_LENGTH = 200;
	private static final long OWNER_JOIN_ORDER = 1;

	private final IdempotencyService idempotencyService;
	private final TripRepository tripRepository;
	private final TripMemberRepository tripMemberRepository;
	private final TripDestinationRepository tripDestinationRepository;
	private final RegionRepository regionRepository;
	private final ChatRoomInitializer chatRoomInitializer;
	private final ItineraryInitializer itineraryInitializer;
	private final TripResponseAssembler tripResponseAssembler;
	private final TripAccessChecker tripAccessChecker;
	private final ApplicationEventPublisher eventPublisher;
	private final Clock clock;

	// 여행·방장 멤버십·여행지·그룹 채팅방·빈 단일 코스를 한 트랜잭션으로 만든다. 공동 피드는 게시 때 만든다(D-4)
	@Transactional
	public TripResponse createTrip(UUID userId, String idempotencyKey, CreateTripRequest request) {
		NewTrip newTrip = validate(request);
		return idempotencyService.execute(userId, CREATE_SCOPE, idempotencyKey, request, TripResponse.class,
				HttpStatus.CREATED, () -> create(userId, newTrip));
	}

	private TripResponse create(UUID userId, NewTrip newTrip) {
		// DB(timestamptz)는 마이크로초까지 저장하므로 생성 응답과 이후 조회 값이 같도록 맞춘다
		Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
		TripStatus status = TripStatusPolicy.resolve(newTrip.startDate(), newTrip.endDate(),
				TripStatusPolicy.today(clock));

		Trip trip = tripRepository.save(
				Trip.create(userId, newTrip.title(), newTrip.startDate(), newTrip.endDate(), status, now));
		TripMember owner = tripMemberRepository.save(TripMember.join(trip.getId(), userId, OWNER_JOIN_ORDER, now));
		saveDestinations(trip.getId(), newTrip.destinationRegionIds());
		chatRoomInitializer.openTripRoom(trip.getId(), userId, now);
		itineraryInitializer.createEmpty(trip.getId(), owner.getId(), now);
		tripRepository.flush();
		// 생성 응답도 조회와 같은 조립을 거쳐 두 응답이 항상 같은 모양이 되게 한다
		return tripResponseAssembler.assemble(userId, trip);
	}

	// 모든 멤버가 이름·기간·여행지를 고친다(D-9). 행 잠금 후 expectedVersion을 비교해 다른 수정을 덮어쓰지 않는다
	@Transactional
	public TripResponse updateTrip(UUID userId, UUID tripId, UpdateTripRequest request) {
		List<ErrorField> errors = new ArrayList<>();
		if (request.getExpectedVersion() == null) {
			errors.add(new ErrorField("expectedVersion", "수정 전에 조회한 version을 보내 주세요."));
		}
		String requestedTitle = request.sentTitle() ? validateTitle(request.getTitle(), errors) : null;
		List<UUID> requestedRegionIds = null;
		if (request.sentDestinationRegionIds()) {
			if (request.getDestinationRegionIds() == null) {
				errors.add(new ErrorField("destinationRegionIds", "여행지를 모두 비우려면 빈 배열([])을 보내 주세요."));
			} else {
				validateRegionIds(request.getDestinationRegionIds(), errors);
				requestedRegionIds = request.getDestinationRegionIds();
			}
		}
		throwIfInvalid(errors);

		Trip trip = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId).trip();
		if (trip.getVersion() != request.getExpectedVersion()) {
			throw new BusinessException(TripErrorCode.VERSION_CONFLICT);
		}

		// 기간은 저장된 값과 합친 결과로 다시 검사한다(한쪽만 비우는 요청 방지)
		LocalDate startDate = request.sentStartDate() ? request.getStartDate() : trip.getStartDate();
		LocalDate endDate = request.sentEndDate() ? request.getEndDate() : trip.getEndDate();
		validatePeriod(startDate, endDate, errors);
		throwIfInvalid(errors);
		String title = requestedTitle != null ? requestedTitle : trip.getTitle();

		List<TripDestination> currentDestinations = tripDestinationRepository.findAllByTripIdOrderByDisplayOrder(tripId);
		List<UUID> currentRegionIds = currentDestinations.stream().map(TripDestination::getRegionId).toList();
		Set<String> changedFields = new LinkedHashSet<>();
		if (!title.equals(trip.getTitle())) {
			changedFields.add("title");
		}
		if (!Objects.equals(startDate, trip.getStartDate())) {
			changedFields.add("startDate");
		}
		if (!Objects.equals(endDate, trip.getEndDate())) {
			changedFields.add("endDate");
		}
		if (requestedRegionIds != null && !requestedRegionIds.equals(currentRegionIds)) {
			changedFields.add("destinationRegionIds");
		}
		// 바뀐 값이 없으면 버전을 올리지 않고 이벤트도 내지 않는다(P-8)
		if (changedFields.isEmpty()) {
			return tripResponseAssembler.assemble(userId, trip);
		}

		Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
		if (changedFields.contains("destinationRegionIds")) {
			// 같은 지역이 다시 들어올 수 있어 기존 행 삭제를 먼저 반영한 뒤 넣는다
			tripDestinationRepository.deleteAll(currentDestinations);
			tripDestinationRepository.flush();
			saveDestinations(tripId, requestedRegionIds);
		}
		trip.updateInfo(title, startDate, endDate,
				TripStatusPolicy.resolve(startDate, endDate, TripStatusPolicy.today(clock)), now);
		tripRepository.flush();

		eventPublisher.publishEvent(new TripInfoChangedEvent(tripId, userId, changedFields, trip.getVersion(), now));
		return tripResponseAssembler.assemble(userId, trip);
	}

	private void saveDestinations(UUID tripId, List<UUID> regionIds) {
		for (int order = 0; order < regionIds.size(); order++) {
			tripDestinationRepository.save(TripDestination.of(tripId, regionIds.get(order), order));
		}
	}

	// 모든 입력 오류를 한 번에 알린다(P-1·P-5·P-6)
	private NewTrip validate(CreateTripRequest request) {
		List<ErrorField> errors = new ArrayList<>();
		String title = validateTitle(request.title(), errors);
		validatePeriod(request.startDate(), request.endDate(), errors);
		List<UUID> regionIds = request.destinationRegionIds() == null ? List.of() : request.destinationRegionIds();
		validateRegionIds(regionIds, errors);
		throwIfInvalid(errors);
		return new NewTrip(title, request.startDate(), request.endDate(), List.copyOf(regionIds));
	}

	private String validateTitle(String rawTitle, List<ErrorField> errors) {
		String title = rawTitle == null ? "" : rawTitle.strip();
		if (title.isEmpty()) {
			errors.add(new ErrorField("title", "여행 이름을 입력해 주세요."));
		} else if (title.length() > TITLE_MAX_LENGTH) {
			errors.add(new ErrorField("title", "여행 이름은 " + TITLE_MAX_LENGTH + "자 이하로 입력해 주세요."));
		}
		return title;
	}

	private void validatePeriod(LocalDate startDate, LocalDate endDate, List<ErrorField> errors) {
		if (startDate == null && endDate != null) {
			errors.add(new ErrorField("startDate", "시작일과 종료일을 함께 입력해 주세요."));
		} else if (startDate != null && endDate == null) {
			errors.add(new ErrorField("endDate", "시작일과 종료일을 함께 입력해 주세요."));
		} else if (startDate != null && startDate.isAfter(endDate)) {
			errors.add(new ErrorField("endDate", "종료일은 시작일과 같거나 이후여야 합니다."));
		}
	}

	private void validateRegionIds(List<UUID> regionIds, List<ErrorField> errors) {
		if (regionIds.stream().anyMatch(Objects::isNull)) {
			errors.add(new ErrorField("destinationRegionIds", "여행지 ID가 비어 있습니다."));
		} else if (new HashSet<>(regionIds).size() != regionIds.size()) {
			errors.add(new ErrorField("destinationRegionIds", "같은 여행지를 두 번 넣을 수 없습니다."));
		} else if (!regionIds.isEmpty() && regionRepository.findAllById(regionIds).size() != regionIds.size()) {
			errors.add(new ErrorField("destinationRegionIds", "존재하지 않는 여행지가 있습니다."));
		}
	}

	private void throwIfInvalid(List<ErrorField> errors) {
		if (!errors.isEmpty()) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
					List.copyOf(errors));
		}
	}

	private record NewTrip(String title, LocalDate startDate, LocalDate endDate, List<UUID> destinationRegionIds) {
	}

}
