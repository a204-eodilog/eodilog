package com.eodilog.facility.ev;

import java.time.Instant;
import java.util.List;

/** 충전소 정보 API. 실패(장애·시간 초과·오류 코드)는 {@link EvChargerUnavailableException} */
public interface EvChargerClient {

	/** 전국 충전기 정보 한 쪽(충전소 위치·이름과 그 순간의 상태 포함) */
	Page<ChargerInfo> infoPage(int pageNo, int rows);

	/** 최근 periodMinutes분 사이 상태가 바뀐 충전기 한 쪽 */
	Page<ChargerStatus> statusPage(int pageNo, int rows, int periodMinutes);

	record Page<T>(long totalCount, List<T> items) {
	}

	/** deleted는 공급자의 삭제 표시(delYn=Y) */
	record ChargerInfo(String stationId, String stationName, String address, double latitude, double longitude,
			String operatorName, String useTime, String chargerId, String chargerType, Integer outputKw, String status,
			Instant statusUpdatedAt, boolean deleted) {
	}

	record ChargerStatus(String stationId, String chargerId, String status, Instant statusUpdatedAt) {
	}

}
