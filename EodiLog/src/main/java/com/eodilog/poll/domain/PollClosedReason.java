package com.eodilog.poll.domain;

// DEADLINE은 최다 후보를 확정한 마감, NO_VOTES는 0표라 확정 없이 끝난 마감이다(V-13)
// 마감 계기가 아니라 결과다. 연 사람이 직접 종료해도 같은 값을 쓰고, 직접 종료 여부는 Poll.closedByMemberId로 본다(V-16)
public enum PollClosedReason {
	DEADLINE, NO_VOTES
}
