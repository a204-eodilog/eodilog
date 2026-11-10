package com.eodilog.weather.kma;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import tools.jackson.databind.JsonNode;

// 기상청 단기·중기예보 조회. 시각은 모두 한국 시각이다
// 빈 Optional은 그 발표가 아직 없다는 뜻(NO_DATA)이고, 장애·키 오류·형식 오류는 KmaUnavailableException이다
public interface KmaForecastClient {

	Optional<List<ShortTermValue>> shortTerm(KmaGrid grid, LocalDateTime baseTime);

	// 육상예보 한 구역의 item(rnSt4Am…, wf10)
	Optional<JsonNode> midLand(String landRegId, LocalDateTime announcedAt);

	// 기온 한 지점의 item(taMin4…, taMax10)
	Optional<JsonNode> midTemperature(String temperatureRegId, LocalDateTime announcedAt);

	record ShortTermValue(String category, LocalDate date, LocalTime time, String value) {
	}

	class KmaUnavailableException extends RuntimeException {

		public KmaUnavailableException(String message) {
			super(message);
		}

		public KmaUnavailableException(String message, Throwable cause) {
			super(message, cause);
		}

	}

}
