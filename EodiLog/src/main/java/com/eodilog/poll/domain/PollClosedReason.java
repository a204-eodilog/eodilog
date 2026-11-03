package com.eodilog.poll.domain;

// DEADLINE은 최다 후보를 확정한 마감, NO_VOTES는 0표라 확정 없이 끝난 마감이다(V-13)
public enum PollClosedReason {
	DEADLINE, NO_VOTES
}
