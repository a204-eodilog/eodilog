package com.eodilog.facility;

/**
 * 편의시설 종류(명세 Q-8, EODI-304). 값은 프론트 S28 칩(`facility.FACILITY_TYPES`)과 같다.
 * 충전소는 환경공단 충전소 표, 화장실은 공중화장실 표, 나머지는 공공데이터 장소(places)의 업종·이름으로 찾는다
 */
public enum FacilityType {
	EV_CHARGER,
	GAS_STATION,
	TOILET,
	PHARMACY,
	CONVENIENCE_STORE
}
