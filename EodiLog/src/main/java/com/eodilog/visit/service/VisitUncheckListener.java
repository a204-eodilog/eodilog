package com.eodilog.visit.service;

import java.util.UUID;

// 방문 체크 해제를 visit.candidate에 알린다. visit.candidate가 visit.service를 쓰므로 거꾸로 의존하지 않도록 인터페이스로 둔다
public interface VisitUncheckListener {

	/** 체크 해제(소프트 삭제)와 같은 트랜잭션에서 부른다. 그 방문을 만든 확정 후보는 더 확정할 수 없게 된다. */
	void visitUnchecked(UUID visitId);

}
