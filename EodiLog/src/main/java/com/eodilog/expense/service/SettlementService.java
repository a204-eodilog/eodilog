package com.eodilog.expense.service;

import com.eodilog.expense.dto.SettlementStateResponse;
import com.eodilog.expense.exception.ExpenseErrorCode;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.trip.domain.Trip;
import com.eodilog.trip.service.TripAccessChecker;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 정산 상태(명세 §7). 1인 부담액 10원 올림 시점·차액 귀속(Q-10)이 정해지기 전에는 계산을 만들지 않는다
// 계산 저장(settlements)·이전 계산 목록은 Q-10 합의 후 추가한다
@Service
@RequiredArgsConstructor
public class SettlementService {

	private final TripAccessChecker tripAccessChecker;

	// GET은 계산을 만들지 않는다. 계산 결과가 없으니 current는 null, 다시 계산할 대상도 없으므로 recalculationRequired는 false
	@Transactional(readOnly = true)
	public SettlementStateResponse getState(UUID userId, UUID tripId) {
		Trip trip = tripAccessChecker.requireActiveMember(tripId, userId).trip();
		return new SettlementStateResponse(null, trip.getExpenseVersion(), false);
	}

	// 멤버 확인 뒤 항상 409로 막는다. 정책이 정해지면 비용 스냅샷·원금/올림 차액·송금 제안을 저장하도록 바꾼다
	@Transactional(readOnly = true)
	public void requestCalculation(UUID userId, UUID tripId) {
		tripAccessChecker.requireActiveMember(tripId, userId);
		throw new BusinessException(ExpenseErrorCode.SETTLEMENT_POLICY_PENDING);
	}

}
