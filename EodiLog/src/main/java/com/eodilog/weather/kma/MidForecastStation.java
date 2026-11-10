package com.eodilog.weather.kma;

import java.util.Comparator;
import java.util.List;

// 중기예보 기온 지점과 그 지점이 속한 육상예보 구역(W-2). 장소 좌표에서 가장 가까운 지점을 쓴다
// 코드는 2026-11-09 실제 getMidTa·getMidLandFcst 호출로 모두 확인했다. 좌표는 각 도시 중심 근사값이다
public record MidForecastStation(String name, String temperatureRegId, String landRegId, double latitude,
		double longitude) {

	static final List<MidForecastStation> ALL = List.of(
			new MidForecastStation("서울", "11B10101", "11B00000", 37.5665, 126.9780),
			new MidForecastStation("인천", "11B20201", "11B00000", 37.4563, 126.7052),
			new MidForecastStation("수원", "11B20601", "11B00000", 37.2636, 127.0286),
			new MidForecastStation("춘천", "11D10301", "11D10000", 37.8813, 127.7298),
			new MidForecastStation("원주", "11D10401", "11D10000", 37.3422, 127.9202),
			new MidForecastStation("강릉", "11D20501", "11D20000", 37.7519, 128.8761),
			new MidForecastStation("대전", "11C20401", "11C20000", 36.3504, 127.3845),
			new MidForecastStation("서산", "11C20101", "11C20000", 36.7845, 126.4503),
			new MidForecastStation("세종", "11C20404", "11C20000", 36.4800, 127.2890),
			new MidForecastStation("청주", "11C10301", "11C10000", 36.6424, 127.4890),
			new MidForecastStation("광주", "11F20501", "11F20000", 35.1595, 126.8526),
			new MidForecastStation("목포", "21F20801", "11F20000", 34.8118, 126.3922),
			new MidForecastStation("여수", "11F20401", "11F20000", 34.7604, 127.6622),
			new MidForecastStation("전주", "11F10201", "11F10000", 35.8242, 127.1480),
			new MidForecastStation("군산", "21F10501", "11F10000", 35.9676, 126.7369),
			new MidForecastStation("대구", "11H10701", "11H10000", 35.8714, 128.6014),
			new MidForecastStation("안동", "11H10501", "11H10000", 36.5684, 128.7294),
			new MidForecastStation("포항", "11H10201", "11H10000", 36.0190, 129.3435),
			new MidForecastStation("부산", "11H20201", "11H20000", 35.1796, 129.0756),
			new MidForecastStation("울산", "11H20101", "11H20000", 35.5384, 129.3114),
			new MidForecastStation("창원", "11H20301", "11H20000", 35.2281, 128.6811),
			new MidForecastStation("제주", "11G00201", "11G00000", 33.4996, 126.5312),
			new MidForecastStation("서귀포", "11G00401", "11G00000", 33.2541, 126.5600));

	public static MidForecastStation nearest(double latitude, double longitude) {
		return ALL.stream()
				.min(Comparator.comparingDouble(station -> station.squaredDistance(latitude, longitude)))
				.orElseThrow();
	}

	// 지점 고르기용 근사 거리. 경도 1도의 길이를 위도에 맞춰 줄인다
	private double squaredDistance(double lat, double lon) {
		double dLat = lat - latitude;
		double dLon = (lon - longitude) * Math.cos(Math.toRadians((lat + latitude) / 2));
		return dLat * dLat + dLon * dLon;
	}

}
