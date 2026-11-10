package com.eodilog.itinerary.proposal;

// 명세 ProposalWrite.reason. 이번에는 INITIAL만 처리한다(정책 I-1). 나머지는 날씨 대안·장소 제외 재계산 작업 때 연다
public enum ProposalReason {
	INITIAL, PLACE_REMOVED, WEATHER
}
