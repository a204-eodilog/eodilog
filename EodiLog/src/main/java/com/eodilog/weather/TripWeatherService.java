package com.eodilog.weather;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.place.dto.PlaceView;
import com.eodilog.place.service.PlaceReader;
import com.eodilog.trip.domain.Trip;
import com.eodilog.trip.service.TripAccessChecker;
import com.eodilog.weather.dto.Weather;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

// GET /trips/{tripId}/weather(정책 W-8). 외부 호출이 있으므로 트랜잭션을 잡지 않는다
// 날씨 설정(weather_mode)은 AI 제안에만 적용되므로 조회는 막지 않는다
@Service
@RequiredArgsConstructor
public class TripWeatherService {

	private final TripAccessChecker tripAccessChecker;
	private final PlaceReader placeReader;
	private final WeatherService weatherService;
	private final JdbcTemplate jdbcTemplate;

	public Weather get(UUID userId, UUID tripId, LocalDate date, UUID placeId) {
		Trip trip = tripAccessChecker.requireActiveMember(tripId, userId).trip();
		requireDateInTrip(trip, date, "date");
		PlaceView place = requireTripPlace(tripId, placeId);
		return weatherService.forecast(place.id(), place.latitude().doubleValue(), place.longitude().doubleValue(),
				date);
	}

	// 여행 기간이 있으면 그 안이어야 한다. 기간이 없는 여행(S25 여행 시작 전)은 날짜를 막지 않는다
	public static void requireDateInTrip(Trip trip, LocalDate date, String field) {
		if (trip.getStartDate() != null && trip.getEndDate() != null
				&& (date.isBefore(trip.getStartDate()) || date.isAfter(trip.getEndDate()))) {
			throw invalid(field, "여행 기간 안의 날짜를 보내 주세요.");
		}
	}

	// 그 여행의 현재 코스나 여행 저장 장소만 조회한다. 일반 날씨 조회 통로로 쓰이지 않게 한다
	private PlaceView requireTripPlace(UUID tripId, UUID placeId) {
		Boolean inTrip = jdbcTemplate.queryForObject("""
				select exists(select 1 from trip_place_saves where trip_id = ? and place_id = ?)
				    or exists(select 1 from itinerary_items ii join itineraries i on i.id = ii.itinerary_id
				              where i.trip_id = ? and ii.place_id = ?)""", Boolean.class, tripId, placeId, tripId, placeId);
		if (!Boolean.TRUE.equals(inTrip)) {
			throw invalid("placeId", "이 여행의 코스나 저장 장소에 있는 장소를 보내 주세요.");
		}
		return placeReader.find(placeId)
				.orElseThrow(() -> invalid("placeId", "이 여행의 코스나 저장 장소에 있는 장소를 보내 주세요."));
	}

	private static BusinessException invalid(String field, String message) {
		return new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
				List.of(new ErrorField(field, message)));
	}

}
