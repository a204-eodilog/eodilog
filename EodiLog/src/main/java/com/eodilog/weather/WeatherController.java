package com.eodilog.weather;

import com.eodilog.global.common.error.ErrorResponse;
import com.eodilog.global.common.response.DataResponse;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.global.security.AuthUser;
import com.eodilog.job.JobRef;
import com.eodilog.trip.controller.CurrentUser;
import com.eodilog.weather.alternative.WeatherAlternativeRequest;
import com.eodilog.weather.alternative.WeatherAlternativeService;
import com.eodilog.weather.dto.Weather;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "날씨", description = "여행 장소의 날씨 예보 조회와 AI 날씨 대안 제안")
@RestController
@RequestMapping("/api/v1/trips/{tripId}")
@RequiredArgsConstructor
public class WeatherController {

	private final TripWeatherService tripWeatherService;
	private final WeatherAlternativeService weatherAlternativeService;

	@Operation(summary = "장소 날씨 조회", description = """
			여행의 ACTIVE 멤버. 기상청 예보만 쓴다(관측 아님). 오늘~3일 뒤는 단기예보(source=KMA_SHORT_TERM_FORECAST, 시간별 hourly 포함),
			4~10일 뒤는 중기예보(source=KMA_MID_TERM_FORECAST, 오전·오후 값만이라 hourly=[])다.
			placeId는 이 여행의 코스나 저장 장소여야 하고, 여행 기간이 있으면 date는 그 안이어야 한다.
			모르는 값은 null이다. 공급자 장애 때 6시간 안에 조회한 값이 있으면 stale=true로 그 값을 준다(queriedAt은 그 조회 시각).
			날씨 대안 설정이 꺼져 있어도 조회는 된다.""")
	@ApiResponse(responseCode = "200", description = "조회 성공")
	@ApiResponse(responseCode = "400", description = "VALIDATION_ERROR: date·placeId 없음·형식 오류, 여행 밖 장소(fields placeId), 여행 기간 밖 날짜(fields date)",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "422", description = "WEATHER_NOT_AVAILABLE: 지난 날짜, 10일 뒤를 넘는 날짜, 국내 예보 범위 밖 장소",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "503", description = "PROVIDER_UNAVAILABLE: 기상청 장애·시간 초과(최근 값도 없음)",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@GetMapping("/weather")
	public ResponseEntity<DataResponse<Weather>> getWeather(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "날짜(한국 시각 기준 YYYY-MM-DD)", example = "2026-11-14", required = true)
			@RequestParam LocalDate date,
			@Parameter(description = "장소 ID(UUID). 이 여행의 코스나 저장 장소", required = true)
			@RequestParam UUID placeId) {
		return ResponseEntity.ok(DataResponse.of(
				tripWeatherService.get(CurrentUser.requireUserId(authUser), tripId, date, placeId)));
	}

	@Operation(summary = "AI 날씨 대안 요청", description = """
			여행의 ACTIVE 멤버이고 날씨 대안 설정(ai.weather)이 OFF가 아니어야 한다. 요청 시점에 그날 대상 장소의 날씨를 조회해 고정하고,
			그날 코스·주변 실내 후보 장소와 함께 WEATHER_ALTERNATIVES 작업을 등록한다. 결과는 GET /jobs/{jobId}로 본다.
			대안은 제안만 하며 코스를 바꾸지 않는다. 코스를 바꾸려면 고른 alternativeId로 POST /itinerary/proposals(reason=WEATHER)를 요청한다.
			placeId는 date 일차 코스에 있는 장소여야 한다. expectedVersion은 GET /itinerary의 version이다.
			Idempotency-Key가 필수이며 같은 키·같은 본문이면 처음 접수한 작업을 그대로 반환한다.""")
	@ApiResponse(responseCode = "202", description = "작업 접수")
	@ApiResponse(responseCode = "400", description = "VALIDATION_ERROR: 키·date·placeId·expectedVersion 없음, 여행 기간 밖 날짜(fields date)",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "404", description = "TRIP_NOT_FOUND: 없거나 볼 수 없는 여행",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "409", description = """
			AI_FEATURE_DISABLED: 요청자의 날씨 대안 설정이 OFF / VERSION_CONFLICT: 코스가 이미 바뀜(다시 조회) /
			IDEMPOTENCY_KEY_REUSED·REQUEST_IN_PROGRESS: 요청 키 충돌""",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "422", description = """
			INSUFFICIENT_DATA: 여행 기간 없음(fields trip.startDate), 그 날짜 코스에 없는 장소(fields placeId) /
			WEATHER_NOT_AVAILABLE: 예보가 없는 날짜·장소""",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@ApiResponse(responseCode = "503", description = "PROVIDER_UNAVAILABLE: 기상청 장애(작업을 만들지 않음)",
			content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class)))
	@PostMapping("/weather-alternatives")
	public ResponseEntity<DataResponse<JobRef>> requestAlternatives(
			@Parameter(hidden = true) @AuthenticationPrincipal AuthUser authUser,
			@Parameter(description = "여행 ID(UUID)", example = "0193c2a1-7e2b-7c4d-9a1e-2f3b4c5d6e70")
			@PathVariable UUID tripId,
			@Parameter(description = "요청 중복 방지 키(1~100자)", required = true)
			@RequestHeader(name = IdempotencyService.HEADER_NAME, required = false) String idempotencyKey,
			@RequestBody WeatherAlternativeRequest request) {
		JobRef job = weatherAlternativeService.request(CurrentUser.requireUserId(authUser), tripId, idempotencyKey,
				request);
		return ResponseEntity.status(HttpStatus.ACCEPTED).body(DataResponse.of(job));
	}

}
