package com.eodilog.invitation.domain;

// 저장하는 상태. 기간이 지난 PENDING은 저장하지 않고 응답에서 EXPIRED로 계산한다
public enum TripFriendInvitationStatus {
	PENDING, ACCEPTED, DECLINED, CANCELED
}
