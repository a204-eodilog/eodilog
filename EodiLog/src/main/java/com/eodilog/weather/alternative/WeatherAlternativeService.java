package com.eodilog.weather.alternative;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.itinerary.domain.Itinerary;
import com.eodilog.itinerary.domain.TransportMode;
import com.eodilog.itinerary.exception.ItineraryErrorCode;
import com.eodilog.itinerary.repository.ItineraryRepository;
import com.eodilog.itinerary.service.CourseWriter;
import com.eodilog.itinerary.service.CourseWriter.CourseSnapshot;
import com.eodilog.itinerary.service.CourseWriter.SnapshotItem;
import com.eodilog.itinerary.service.CourseWriter.SnapshotLeg;
import com.eodilog.job.JobKind;
import com.eodilog.job.JobRef;
import com.eodilog.job.JobService;
import com.eodilog.job.JobSubmission;
import com.eodilog.place.dto.PlaceView;
import com.eodilog.place.service.PlaceReader;
import com.eodilog.trip.domain.Trip;
import com.eodilog.trip.service.TripAccessChecker;
import com.eodilog.weather.TripWeatherService;
import com.eodilog.weather.WeatherErrorCode;
import com.eodilog.weather.WeatherService;
import com.eodilog.weather.dto.Weather;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

// 날씨 대안 요청(정책 W-11~W-18). 날씨는 요청 때 조회해 입력에 고정한다(W-13)
// 외부 호출 중에 여행 행 잠금을 잡지 않도록: 1차 검사(잠금 없음) → 날씨 조회(트랜잭션 밖) → 잠금 후 코스 검사·등록
@Service
@RequiredArgsConstructor
public class WeatherAlternativeService {

	private final IdempotencyService idempotencyService;
	private final TripAccessChecker tripAccessChecker;
	private final ItineraryRepository itineraryRepository;
	private final CourseWriter courseWriter;
	private final PlaceReader placeReader;
	private final AlternativePoolReader alternativePoolReader;
	private final WeatherService weatherService;
	private final WeatherAccess weatherAccess;
	private final JobService jobService;
	private final JsonMapper jsonMapper;
	private final TransactionTemplate transactionTemplate;

	// 같은 키 재요청 판정에 쓰는 정규화한 본문
	record Fingerprint(LocalDate date, UUID placeId, long expectedVersion) {
	}

	// 판정 순서: 키·본문 400 → 404 → (같은 키로 끝난 요청이면 처음 JobRef) → 설정 OFF 409 → 기간 없음 422 → 기간 밖 날짜 400
	// → 없는 장소 422 → 날씨 조회(422 WEATHER_NOT_AVAILABLE / 503) → [잠금] 설정 OFF 409 → version 409
	// → 그 날짜 코스에 없는 장소 422 → 등록
	// 같은 키 재요청은 날씨 조회와 사전 검사 전에 처음 결과를 돌려준다(자정이 지나거나 기상청 장애여도 실패하지 않는다)
	public JobRef request(UUID userId, UUID tripId, String idempotencyKey, WeatherAlternativeRequest request) {
		idempotencyService.validateKey(idempotencyKey);
		validate(request);
		Trip trip = tripAccessChecker.requireActiveMember(tripId, userId).trip();
		Optional<JobRef> completed = idempotencyService.findCompleted(userId, scope(tripId), idempotencyKey,
				fingerprint(request), JobRef.class);
		if (completed.isPresent()) {
			return completed.get();
		}
		if (weatherAccess.disabled(userId)) {
			throw new BusinessException(WeatherErrorCode.AI_FEATURE_DISABLED);
		}
		if (trip.getStartDate() == null || trip.getEndDate() == null) {
			throw insufficient("trip.startDate", "여행 기간을 먼저 정해 주세요.");
		}
		TripWeatherService.requireDateInTrip(trip, request.date(), "date");
		PlaceView target = placeReader.find(request.placeId())
				.orElseThrow(() -> insufficient("placeId", "그 날짜 코스에 있는 장소를 보내 주세요."));
		Weather weather = weatherService.forecast(target.id(), target.latitude().doubleValue(),
				target.longitude().doubleValue(), request.date());
		return transactionTemplate.execute(status -> submit(userId, tripId, idempotencyKey, request, weather));
	}

	private JobRef submit(UUID userId, UUID tripId, String idempotencyKey, WeatherAlternativeRequest request,
			Weather weather) {
		Trip trip = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId).trip();
		long expectedVersion = request.expectedVersion();
		return idempotencyService.execute(userId, scope(tripId), idempotencyKey, fingerprint(request), JobRef.class,
				HttpStatus.ACCEPTED, () -> {
					// 날씨 조회 중에 설정을 껐으면 JobService의 등록 권한 검사(404) 대신 설정 OFF로 알린다
					if (weatherAccess.disabled(userId)) {
						throw new BusinessException(WeatherErrorCode.AI_FEATURE_DISABLED);
					}
					// 코스를 쓰는 모든 경로가 여행 행을 먼저 잠그므로 이 트랜잭션 동안 version이 바뀌지 않는다
					Itinerary itinerary = itineraryRepository.findByTripId(tripId)
							.orElseThrow(() -> new IllegalStateException("코스가 없는 여행입니다: " + tripId));
					if (itinerary.getVersion() != expectedVersion) {
						throw new BusinessException(ItineraryErrorCode.VERSION_CONFLICT);
					}
					// 날씨 조회 중에 기간이 바뀌었을 수 있어 다시 본다
					if (trip.getStartDate() == null || trip.getEndDate() == null) {
						throw insufficient("trip.startDate", "여행 기간을 먼저 정해 주세요.");
					}
					TripWeatherService.requireDateInTrip(trip, request.date(), "date");
					int day = (int) ChronoUnit.DAYS.between(trip.getStartDate(), request.date()) + 1;
					return jobService.submit(new JobSubmission(userId, JobKind.WEATHER_ALTERNATIVES, tripId,
							snapshot(tripId, itinerary, day, request, weather), expectedVersion, null));
				});
	}

	private static String scope(UUID tripId) {
		return "POST /api/v1/trips/" + tripId + "/weather-alternatives";
	}

	private static Fingerprint fingerprint(WeatherAlternativeRequest request) {
		return new Fingerprint(request.date(), request.placeId(), request.expectedVersion());
	}

	// AI spec §6 요청 본문과 같은 모양(W-14). 장소에는 실내 판단용 category를 싣는다. 멤버 정보는 넣지 않는다
	private ObjectNode snapshot(UUID tripId, Itinerary itinerary, int day, WeatherAlternativeRequest request,
			Weather weather) {
		CourseSnapshot course = courseWriter.capture(itinerary.getId());
		List<SnapshotItem> dayItems = course.items().stream().filter(item -> item.day() == day)
				.sorted(Comparator.comparingInt(SnapshotItem::order)).toList();
		// 같은 장소가 그날 여러 번이면 가장 앞선 일정이 대상이다(AI spec AS-15)
		SnapshotItem targetItem = dayItems.stream().filter(item -> item.placeId().equals(request.placeId()))
				.findFirst()
				.orElseThrow(() -> insufficient("placeId", "그 날짜 코스에 있는 장소를 보내 주세요."));
		Set<UUID> dayPlaceIds = new LinkedHashSet<>();
		dayItems.forEach(item -> dayPlaceIds.add(item.placeId()));
		PlaceView target = placeReader.find(targetItem.placeId())
				.orElseThrow(() -> new IllegalStateException("코스 장소가 없습니다: " + targetItem.placeId()));
		List<UUID> poolIds = alternativePoolReader.find(tripId, target, dayPlaceIds);

		Set<UUID> placeIds = new LinkedHashSet<>(dayPlaceIds);
		placeIds.addAll(poolIds);
		Map<UUID, PlaceView> places = placeReader.findAll(placeIds);
		Map<UUID, String> categories = alternativePoolReader.categories(placeIds);

		ObjectNode input = jsonMapper.createObjectNode();
		input.put("date", request.date().toString());
		input.put("placeId", request.placeId().toString());
		input.put("expectedVersion", itinerary.getVersion());
		input.set("weather", jsonMapper.valueToTree(weather));
		ArrayNode items = input.putArray("dayItems");
		for (SnapshotItem item : dayItems) {
			ObjectNode node = items.addObject();
			node.put("id", item.id().toString());
			node.set("place", place(places.get(item.placeId()), categories.get(item.placeId())));
			node.put("day", item.day());
			node.put("order", item.order());
			node.put("startTime", item.startTime());
			if (item.stayMinutes() == null) {
				node.putNull("stayMinutes");
			} else {
				node.put("stayMinutes", item.stayMinutes());
			}
		}
		// 영업 정보 공급자가 없어 모두 UNKNOWN이다(W-16). 이용 시간 문장을 해석해 지어내지 않는다
		ArrayNode pool = input.putArray("alternativePool");
		for (UUID placeId : poolIds) {
			ObjectNode entry = pool.addObject();
			entry.set("place", place(places.get(placeId), categories.get(placeId)));
			ObjectNode openStatus = entry.putObject("openStatus");
			openStatus.put("value", "UNKNOWN");
			openStatus.putNull("checkedAt");
		}
		input.put("defaultTransportMode", transportMode(course.legs(), targetItem.id()).name());
		return input;
	}

	private ObjectNode place(PlaceView view, String category) {
		ObjectNode node = jsonMapper.valueToTree(view);
		if (category == null) {
			node.putNull("category");
		} else {
			node.put("category", category);
		}
		return node;
	}

	// 대상 일정에서 나가는 구간의 수단, 없으면 들어오는 구간, 둘 다 없으면 TRANSIT(W-14)
	private static TransportMode transportMode(List<SnapshotLeg> legs, UUID itemId) {
		return legs.stream().filter(leg -> leg.fromItemId().equals(itemId)).map(SnapshotLeg::transportMode)
				.findFirst()
				.or(() -> legs.stream().filter(leg -> leg.toItemId().equals(itemId)).map(SnapshotLeg::transportMode)
						.findFirst())
				.orElse(TransportMode.TRANSIT);
	}

	private static void validate(WeatherAlternativeRequest request) {
		List<ErrorField> errors = new ArrayList<>();
		if (request.date() == null) {
			errors.add(new ErrorField("date", "날짜를 보내 주세요."));
		}
		if (request.placeId() == null) {
			errors.add(new ErrorField("placeId", "장소를 보내 주세요."));
		}
		if (request.expectedVersion() == null || request.expectedVersion() < 1) {
			errors.add(new ErrorField("expectedVersion", "조회한 코스의 version을 보내 주세요."));
		}
		if (!errors.isEmpty()) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
					List.copyOf(errors));
		}
	}

	private static BusinessException insufficient(String field, String message) {
		return new BusinessException(WeatherErrorCode.INSUFFICIENT_DATA, WeatherErrorCode.INSUFFICIENT_DATA.message(),
				List.of(new ErrorField(field, message)));
	}

}
