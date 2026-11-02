package com.eodilog.expense.service;

import com.eodilog.expense.domain.Expense;
import com.eodilog.expense.domain.ExpenseShare;
import com.eodilog.expense.domain.Settlement;
import com.eodilog.expense.domain.SettlementCalculator;
import com.eodilog.expense.domain.SettlementCalculator.ExpenseInput;
import com.eodilog.expense.domain.SettlementCalculator.ShareInput;
import com.eodilog.expense.domain.SettlementMember;
import com.eodilog.expense.domain.SettlementTransfer;
import com.eodilog.expense.dto.ExpenseShareResponse;
import com.eodilog.expense.dto.IncludedExpenseResponse;
import com.eodilog.expense.dto.SettlementCalculationRequest;
import com.eodilog.expense.dto.SettlementMemberResponse;
import com.eodilog.expense.dto.SettlementResponse;
import com.eodilog.expense.dto.SettlementStateResponse;
import com.eodilog.expense.dto.SettlementTransferResponse;
import com.eodilog.expense.exception.ExpenseErrorCode;
import com.eodilog.expense.repository.ExpenseRepository;
import com.eodilog.expense.repository.ExpenseShareRepository;
import com.eodilog.expense.repository.SettlementMemberRepository;
import com.eodilog.expense.repository.SettlementRepository;
import com.eodilog.expense.repository.SettlementTransferRepository;
import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.common.response.CreatedAtCursor;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.idempotency.IdempotencyService;
import com.eodilog.trip.domain.Trip;
import com.eodilog.trip.domain.TripMember;
import com.eodilog.trip.repository.TripMemberRepository;
import com.eodilog.trip.service.TripAccess;
import com.eodilog.trip.service.TripAccessChecker;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

// 정산(명세 §7). 계산 규칙은 SettlementCalculator(Q-10, 2026-11-02 확정)
// 계산은 여행 행을 잠근 뒤 한 시점의 경비로 하고, 결과는 바꾸지 않고 쌓는다. 여행이 있는 동안 모두 보관한다
@Service
@RequiredArgsConstructor
public class SettlementService {

	private final TripAccessChecker tripAccessChecker;
	private final TripMemberRepository tripMemberRepository;
	private final ExpenseRepository expenseRepository;
	private final ExpenseShareRepository expenseShareRepository;
	private final SettlementRepository settlementRepository;
	private final SettlementMemberRepository settlementMemberRepository;
	private final SettlementTransferRepository settlementTransferRepository;
	private final IdempotencyService idempotencyService;
	private final EntityManager entityManager;
	private final JsonMapper jsonMapper;
	private final Clock clock;

	// GET은 계산을 만들지 않는다. 현재 계산 이후 경비가 바뀌었으면 recalculationRequired=true
	@Transactional(readOnly = true)
	public SettlementStateResponse getState(UUID userId, UUID tripId) {
		Trip trip = tripAccessChecker.requireActiveMember(tripId, userId).trip();
		SettlementResponse current = trip.getCurrentSettlementId() == null ? null
				: toResponses(trip, List.of(settlementRepository.findById(trip.getCurrentSettlementId())
						.orElseThrow(() -> new IllegalStateException("Missing current settlement: " + tripId))))
						.getFirst();
		return new SettlementStateResponse(current, trip.getExpenseVersion(), current != null && current.stale());
	}

	// 판정 순서: 입력 400(본문·키 형식) → 여행 행 잠금 후 ACTIVE 멤버 404 → 멱등 처리 → 비용 버전 409
	// 재요청도 권한 검사를 먼저 거치고, 잠금은 항상 여행 행 → 멱등 기록 순서다(AGENTS.md 멱등 규칙)
	@Transactional
	public SettlementResponse calculate(UUID userId, UUID tripId, String idempotencyKey,
			SettlementCalculationRequest request) {
		if (request.expectedExpenseVersion() == null) {
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
					List.of(new ErrorField("expectedExpenseVersion", "계산 전에 조회한 비용 버전을 보내 주세요.")));
		}
		idempotencyService.validateKey(idempotencyKey);
		TripAccess access = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId);
		return idempotencyService.execute(userId, "POST /api/v1/trips/" + tripId + "/settlements", idempotencyKey,
				request, SettlementResponse.class, HttpStatus.CREATED,
				() -> create(access, request.expectedExpenseVersion()));
	}

	private SettlementResponse create(TripAccess access, long expectedExpenseVersion) {
		Trip trip = access.trip();
		if (trip.getExpenseVersion() != expectedExpenseVersion) {
			throw new BusinessException(ExpenseErrorCode.VERSION_CONFLICT);
		}
		Map<UUID, TripMember> members = membersById(trip.getId());
		List<Expense> expenses = expenseRepository.findAllByTripIdAndDeletedAtIsNullOrderByCreatedAtAscIdAsc(trip.getId());
		Map<UUID, List<ExpenseShare>> sharesByExpense = expenseShareRepository
				.findAllByExpenseIdIn(expenses.stream().map(Expense::getId).toList()).stream()
				.collect(Collectors.groupingBy(ExpenseShare::getExpenseId));

		List<IncludedExpenseResponse> snapshot = expenses.stream()
				.map(expense -> new IncludedExpenseResponse(expense.getId(), expense.getVersion(), expense.getTitle(),
						expense.getAmountMinor(), expense.getPayerMemberId(),
						sharesByExpense.getOrDefault(expense.getId(), List.of()).stream()
								.sorted(Comparator.comparingLong(share -> members.get(share.getMemberId()).getJoinOrder()))
								.map(share -> new ExpenseShareResponse(share.getMemberId(), share.getAmountMinor()))
								.toList()))
				.toList();
		SettlementCalculator.Result result = SettlementCalculator.calculate(
				snapshot.stream().map(SettlementService::toInput).toList(),
				members.values().stream().collect(Collectors.toMap(TripMember::getId, TripMember::getJoinOrder)));

		Settlement settlement = settlementRepository.save(Settlement.create(trip.getId(), access.member().getId(),
				trip.getExpenseVersion(), result.totalAmountMinor(), result.roundingAdjustmentMinor(),
				jsonMapper.writeValueAsString(snapshot), now()));
		// 표시 순서는 계산할 때 정해 저장한다. 멤버는 참여 순(계산기 결과 순서), 송금 제안은 금액이 큰 순
		Comparator<UUID> byJoinOrder = Comparator.comparingLong(memberId -> members.get(memberId).getJoinOrder());
		List<SettlementCalculator.TransferResult> transfers = result.transfers().stream()
				.sorted(Comparator.comparingLong(SettlementCalculator.TransferResult::amountMinor).reversed()
						.thenComparing(SettlementCalculator.TransferResult::fromMemberId, byJoinOrder)
						.thenComparing(SettlementCalculator.TransferResult::toMemberId, byJoinOrder))
				.toList();
		settlementMemberRepository.saveAll(IntStream.range(0, result.members().size())
				.mapToObj(i -> SettlementMember.of(settlement.getId(), result.members().get(i), i + 1)).toList());
		settlementTransferRepository.saveAll(IntStream.range(0, transfers.size())
				.mapToObj(i -> SettlementTransfer.of(settlement.getId(), transfers.get(i), i + 1)).toList());
		trip.replaceCurrentSettlement(settlement.getId());
		settlementRepository.flush();
		return toResponses(trip, List.of(settlement)).getFirst();
	}

	// 이전 계산 목록. 최근 계산 순(calculatedAt DESC, id DESC)
	@Transactional(readOnly = true)
	public PageResponse<SettlementResponse> getSettlements(UUID userId, UUID tripId, String cursor, int limit) {
		Trip trip = tripAccessChecker.requireActiveMember(tripId, userId).trip();
		CreatedAtCursor after = cursor == null || cursor.isBlank() ? null : CreatedAtCursor.decode(cursor);

		String jpql = "select s from Settlement s where s.tripId = :tripId"
				+ (after == null ? "" : " and (s.calculatedAt < :cursorAt or (s.calculatedAt = :cursorAt and s.id < :cursorId))")
				+ " order by s.calculatedAt desc, s.id desc";
		TypedQuery<Settlement> query = entityManager.createQuery(jpql, Settlement.class)
				.setParameter("tripId", tripId)
				.setMaxResults(limit + 1);
		if (after != null) {
			query.setParameter("cursorAt", after.createdAt()).setParameter("cursorId", after.id());
		}
		List<Settlement> found = query.getResultList();
		boolean hasNext = found.size() > limit;
		List<Settlement> page = hasNext ? found.subList(0, limit) : found;
		String nextCursor = hasNext
				? new CreatedAtCursor(page.getLast().getCalculatedAt(), page.getLast().getId()).encode()
				: null;
		return PageResponse.of(toResponses(trip, page), nextCursor, hasNext);
	}

	@Transactional(readOnly = true)
	public SettlementResponse getSettlement(UUID userId, UUID tripId, UUID settlementId) {
		Trip trip = tripAccessChecker.requireActiveMember(tripId, userId).trip();
		Settlement settlement = settlementRepository.findByIdAndTripId(settlementId, tripId)
				.orElseThrow(() -> new BusinessException(ExpenseErrorCode.SETTLEMENT_NOT_FOUND));
		return toResponses(trip, List.of(settlement)).getFirst();
	}

	// 멤버·송금 제안은 계산할 때 저장한 표시 순서대로 준다. 이후 재참여로 참여 순이 바뀌어도 과거 계산은 그대로다
	// stale: 이후 경비가 바뀌었거나(비용 버전 불일치) 더 새 계산이 현재 계산이 됐다(ERD settlements 노트)
	private List<SettlementResponse> toResponses(Trip trip, List<Settlement> settlements) {
		if (settlements.isEmpty()) {
			return List.of();
		}
		List<UUID> ids = settlements.stream().map(Settlement::getId).toList();
		Map<UUID, List<SettlementMember>> membersBySettlement = settlementMemberRepository.findAllBySettlementIdIn(ids)
				.stream().collect(Collectors.groupingBy(SettlementMember::getSettlementId));
		Map<UUID, List<SettlementTransfer>> transfersBySettlement = settlementTransferRepository
				.findAllBySettlementIdIn(ids).stream()
				.collect(Collectors.groupingBy(SettlementTransfer::getSettlementId));

		return settlements.stream().map(settlement -> new SettlementResponse(
				settlement.getId(),
				settlement.getTripId(),
				settlement.getCurrency(),
				settlement.getExpenseVersion(),
				settlement.getVersion(),
				settlement.getExpenseVersion() != trip.getExpenseVersion()
						|| !settlement.getId().equals(trip.getCurrentSettlementId()),
				settlement.getTotalAmountMinor(),
				readSnapshot(settlement),
				membersBySettlement.getOrDefault(settlement.getId(), List.of()).stream()
						.sorted(Comparator.comparingInt(SettlementMember::getDisplayOrder))
						.map(member -> new SettlementMemberResponse(member.getMemberId(), member.getPaidMinor(),
								member.getBaseOwedMinor(), member.getOwedMinor(), member.getRoundingAdjustmentMinor(),
								member.getBalanceMinor()))
						.toList(),
				transfersBySettlement.getOrDefault(settlement.getId(), List.of()).stream()
						.sorted(Comparator.comparingInt(SettlementTransfer::getDisplayOrder))
						.map(transfer -> new SettlementTransferResponse(transfer.getId(), transfer.getFromMemberId(),
								transfer.getToMemberId(), transfer.getAmountMinor()))
						.toList(),
				settlement.getRoundingPolicy(),
				settlement.getRoundingAdjustmentMinor(),
				settlement.getCalculatedAt())).toList();
	}

	private List<IncludedExpenseResponse> readSnapshot(Settlement settlement) {
		return Arrays.asList(jsonMapper.readValue(settlement.getExpenseSnapshotJson(), IncludedExpenseResponse[].class));
	}

	private static ExpenseInput toInput(IncludedExpenseResponse expense) {
		return new ExpenseInput(expense.expenseId(), expense.amountMinor(), expense.payerMemberId(),
				expense.shares().stream().map(share -> new ShareInput(share.memberId(), share.amountMinor())).toList());
	}

	// 이탈한 멤버도 과거 결제자·분담자로 나오므로 상태와 관계없이 이 여행의 멤버십 전체를 읽는다
	private Map<UUID, TripMember> membersById(UUID tripId) {
		return tripMemberRepository.findAllByTripIdOrderByJoinOrder(tripId).stream()
				.collect(Collectors.toMap(TripMember::getId, Function.identity(), (a, b) -> a, LinkedHashMap::new));
	}

	// DB(timestamptz)는 마이크로초까지 저장하므로 응답과 이후 조회 값이 같도록 맞춘다
	private Instant now() {
		return clock.instant().truncatedTo(ChronoUnit.MICROS);
	}

}
