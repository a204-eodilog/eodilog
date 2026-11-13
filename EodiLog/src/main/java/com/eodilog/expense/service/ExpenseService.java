package com.eodilog.expense.service;

import com.eodilog.expense.domain.EqualSplit;
import com.eodilog.expense.domain.Expense;
import com.eodilog.expense.domain.ExpenseShare;
import com.eodilog.expense.dto.CreateExpenseRequest;
import com.eodilog.expense.dto.ExpenseResponse;
import com.eodilog.expense.dto.ExpenseShareResponse;
import com.eodilog.expense.dto.UpdateExpenseRequest;
import com.eodilog.expense.exception.ExpenseErrorCode;
import com.eodilog.expense.repository.ExpenseRepository;
import com.eodilog.expense.repository.ExpenseShareRepository;
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
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 여행 경비(명세 §7). 누구나 등록하지만 수정·삭제는 ACTIVE 멤버인 등록자만 한다. 방장·결제자 권한으로 대신하지 않는다
// 등록·수정·삭제는 여행 행을 잠근 뒤 경비·분담액과 trips.expense_version을 함께 바꾼다(ERD 불변식 5)
@Service
@RequiredArgsConstructor
public class ExpenseService {

	public static final int DEFAULT_LIMIT = 20;
	public static final int MAX_LIMIT = 100;

	private static final int TITLE_MAX_LENGTH = 200;
	// 프론트 정밀도 손실을 막는 JSON 안전 정수 상한(명세 §2)
	private static final long MAX_AMOUNT_MINOR = 9_007_199_254_740_991L;

	private final ExpenseRepository expenseRepository;
	private final ExpenseShareRepository expenseShareRepository;
	private final TripMemberRepository tripMemberRepository;
	private final TripAccessChecker tripAccessChecker;
	private final IdempotencyService idempotencyService;
	private final EntityManager entityManager;
	private final Clock clock;

	// 최근 등록 순(createdAt DESC, id DESC). 삭제한 경비는 빼고, 이탈한 멤버도 과거 분담자로 보여 준다
	@Transactional(readOnly = true)
	public PageResponse<ExpenseResponse> getExpenses(UUID userId, UUID tripId, String cursor, int limit) {
		tripAccessChecker.requireActiveMember(tripId, userId);
		CreatedAtCursor after = cursor == null || cursor.isBlank() ? null : CreatedAtCursor.decode(cursor);

		String jpql = "select e from Expense e where e.tripId = :tripId and e.deletedAt is null"
				+ (after == null ? "" : " and (e.createdAt < :cursorCreatedAt or (e.createdAt = :cursorCreatedAt and e.id < :cursorId))")
				+ " order by e.createdAt desc, e.id desc";
		TypedQuery<Expense> query = entityManager.createQuery(jpql, Expense.class)
				.setParameter("tripId", tripId)
				.setMaxResults(limit + 1);
		if (after != null) {
			query.setParameter("cursorCreatedAt", after.createdAt()).setParameter("cursorId", after.id());
		}
		List<Expense> found = query.getResultList();
		boolean hasNext = found.size() > limit;
		List<Expense> page = hasNext ? found.subList(0, limit) : found;
		String nextCursor = hasNext
				? new CreatedAtCursor(page.getLast().getCreatedAt(), page.getLast().getId()).encode()
				: null;

		Map<UUID, List<ExpenseShare>> sharesByExpense = expenseShareRepository
				.findAllByExpenseIdIn(page.stream().map(Expense::getId).toList()).stream()
				.collect(Collectors.groupingBy(ExpenseShare::getExpenseId));
		Map<UUID, TripMember> members = membersById(tripId);
		List<ExpenseResponse> responses = page.stream()
				.map(expense -> toResponse(expense, sharesByExpense.getOrDefault(expense.getId(), List.of()), members))
				.toList();
		return PageResponse.of(responses, nextCursor, hasNext);
	}

	// 등록자는 요청자의 멤버십이다. Idempotency-Key 재시도에도 경비를 한 번만 만든다(명세 §2)
	// 저장된 응답을 다시 줄 때도 지금 ACTIVE 멤버여야 하므로 권한 검사를 멱등 처리보다 먼저 한다
	// 경비 등록은 항상 여행 행 잠금 → 멱등 기록 순서로 잡아 서로 다른 순서로 기다리는 교착을 만들지 않는다
	@Transactional
	public ExpenseResponse createExpense(UUID userId, UUID tripId, String idempotencyKey, CreateExpenseRequest request) {
		NewExpense newExpense = validateCreate(request);
		idempotencyService.validateKey(idempotencyKey);
		TripAccess access = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId);
		return idempotencyService.execute(userId, "POST /api/v1/trips/" + tripId + "/expenses", idempotencyKey,
				request, ExpenseResponse.class, HttpStatus.CREATED, () -> create(access, newExpense));
	}

	private ExpenseResponse create(TripAccess access, NewExpense newExpense) {
		UUID tripId = access.trip().getId();
		Map<UUID, TripMember> members = membersById(tripId);
		List<ErrorField> errors = new ArrayList<>();
		requireActiveMember(members, newExpense.payerMemberId(), "payerMemberId", errors);
		newExpense.participantMemberIds()
				.forEach(memberId -> requireActiveMember(members, memberId, "participantMemberIds", errors));
		throwIfInvalidParticipants(errors);

		Instant now = now();
		Expense expense = expenseRepository.save(Expense.create(tripId, access.member().getId(),
				newExpense.payerMemberId(), newExpense.title(), newExpense.memo(), newExpense.amountMinor(),
				newExpense.spentAt(), now));
		List<ExpenseShare> shares = saveShares(expense.getId(), newExpense.amountMinor(),
				newExpense.participantMemberIds(), members);
		access.trip().increaseExpenseVersion();
		expenseRepository.flush();
		return toResponse(expense, shares, members);
	}

	/** 한 항목 실패 시 전체 트랜잭션을 취소하며 단건과 같은 검증·분담 규칙을 쓴다. */
	@Transactional
	public com.eodilog.expense.dto.ExpenseBatchResponse createBatch(UUID userId, UUID tripId,
			String key, com.eodilog.expense.dto.CreateExpensesRequest request) {
		if (request == null || request.items() == null || request.items().isEmpty()
				|| request.items().stream().anyMatch(Objects::isNull)) {
			throw validationError(List.of(new ErrorField("items", "경비를 1~10건 보내 주세요.")));
		}
		if (request.items().size() > 10) throw new BusinessException(ExpenseErrorCode.INPUT_LIMIT_EXCEEDED);
		List<NewExpense> drafts = request.items().stream().map(this::validateCreate).toList();
		idempotencyService.validateKey(key);
		TripAccess access = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId);
		return idempotencyService.execute(userId, "POST /api/v1/trips/" + tripId + "/expenses/batch", key,
				request, com.eodilog.expense.dto.ExpenseBatchResponse.class, HttpStatus.CREATED,
				() -> new com.eodilog.expense.dto.ExpenseBatchResponse(
						drafts.stream().map(draft -> create(access, draft)).toList()));
	}

	// 생략한 필드는 유지한다. 원금이나 분담자가 바뀌면 분담액을 다시 계산한다
	// 판정 순서: 여행 404 → 경비 404 → 등록자가 아니면 403 → 버전 409(멤버 관리와 같은 순서)
	@Transactional
	public ExpenseResponse updateExpense(UUID userId, UUID tripId, UUID expenseId, UpdateExpenseRequest request) {
		List<ErrorField> errors = new ArrayList<>();
		if (request.getExpectedVersion() == null) {
			errors.add(new ErrorField("expectedVersion", "수정 전에 조회한 version을 보내 주세요."));
		}
		String requestedTitle = request.sentTitle() ? validateTitle(request.getTitle(), errors) : null;
		if (request.sentAmountMinor()) {
			validateAmount(request.getAmountMinor(), errors);
		}
		if (request.sentCurrency() && request.getCurrency() == null) {
			errors.add(new ErrorField("currency", "통화를 보내려면 KRW로 보내 주세요."));
		}
		if (request.sentPayerMemberId() && request.getPayerMemberId() == null) {
			errors.add(new ErrorField("payerMemberId", "결제자를 골라 주세요."));
		}
		if (request.sentParticipantMemberIds()) {
			validateParticipantList(request.getParticipantMemberIds(), errors);
		}
		if (request.sentSpentAt() && request.getSpentAt() == null) {
			errors.add(new ErrorField("spentAt", "지출 시각을 보내 주세요."));
		}
		throwIfInvalid(errors);
		if (request.sentCurrency()) {
			requireKrw(request.getCurrency());
		}

		TripAccess access = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId);
		Expense expense = requireOwnExpense(access, expenseId, request.getExpectedVersion());
		Map<UUID, TripMember> members = membersById(tripId);
		List<ExpenseShare> currentShares = expenseShareRepository.findAllByExpenseId(expenseId);
		Set<UUID> currentParticipants = currentShares.stream().map(ExpenseShare::getMemberId)
				.collect(Collectors.toSet());

		// 새로 넣는 결제자·분담자만 ACTIVE여야 한다. 이미 들어 있던 이탈 멤버는 그대로 둘 수 있다(명세 §7)
		List<ErrorField> participantErrors = new ArrayList<>();
		UUID payerMemberId = request.sentPayerMemberId() ? request.getPayerMemberId() : expense.getPayerMemberId();
		if (!payerMemberId.equals(expense.getPayerMemberId())) {
			requireActiveMember(members, payerMemberId, "payerMemberId", participantErrors);
		}
		List<UUID> participantIds = request.sentParticipantMemberIds()
				? request.getParticipantMemberIds()
				: List.copyOf(currentParticipants);
		for (UUID memberId : participantIds) {
			if (currentParticipants.contains(memberId)) {
				continue;
			}
			requireActiveMember(members, memberId, "participantMemberIds", participantErrors);
		}
		throwIfInvalidParticipants(participantErrors);

		String title = requestedTitle != null ? requestedTitle : expense.getTitle();
		String memo = request.sentMemo() ? normalizeMemo(request.getMemo()) : expense.getMemo();
		long amountMinor = request.sentAmountMinor() ? request.getAmountMinor() : expense.getAmountMinor();
		Instant spentAt = request.sentSpentAt() ? truncate(request.getSpentAt()) : expense.getSpentAt();
		boolean sharesChanged = amountMinor != expense.getAmountMinor()
				|| !new HashSet<>(participantIds).equals(currentParticipants);
		boolean changed = sharesChanged
				|| !payerMemberId.equals(expense.getPayerMemberId())
				|| !title.equals(expense.getTitle())
				|| !Objects.equals(memo, expense.getMemo())
				|| !spentAt.equals(expense.getSpentAt());
		// 바뀐 값이 없으면 경비 version과 비용 버전을 올리지 않는다(여행 수정 P-8과 같은 규칙)
		if (!changed) {
			return toResponse(expense, currentShares, members);
		}

		List<ExpenseShare> shares = currentShares;
		if (sharesChanged) {
			expenseShareRepository.deleteAll(currentShares);
			expenseShareRepository.flush();
			shares = saveShares(expenseId, amountMinor, participantIds, members);
		}
		expense.update(payerMemberId, title, memo, amountMinor, spentAt, now());
		access.trip().increaseExpenseVersion();
		expenseRepository.flush();
		return toResponse(expense, shares, members);
	}

	// 논리 삭제한다. 분담액은 남겨 이전 계산을 재현할 수 있게 하고 비용 버전을 올려 이전 정산을 무효로 만든다(명세 §7)
	@Transactional
	public void deleteExpense(UUID userId, UUID tripId, UUID expenseId, Long expectedVersion) {
		if (expectedVersion == null) {
			throw validationError(List.of(new ErrorField("expectedVersion", "삭제 전에 조회한 version을 보내 주세요.")));
		}
		TripAccess access = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId);
		Expense expense = requireOwnExpense(access, expenseId, expectedVersion);
		expense.delete(now());
		access.trip().increaseExpenseVersion();
		expenseRepository.flush();
	}

	private Expense requireOwnExpense(TripAccess access, UUID expenseId, long expectedVersion) {
		Expense expense = expenseRepository.findByIdAndTripIdAndDeletedAtIsNull(expenseId, access.trip().getId())
				.orElseThrow(() -> new BusinessException(ExpenseErrorCode.EXPENSE_NOT_FOUND));
		if (!expense.isRegisteredBy(access.member().getId())) {
			throw new BusinessException(CommonErrorCode.FORBIDDEN, "경비를 등록한 사람만 수정·삭제할 수 있습니다.");
		}
		if (expense.getVersion() != expectedVersion) {
			throw new BusinessException(ExpenseErrorCode.VERSION_CONFLICT);
		}
		return expense;
	}

	private List<ExpenseShare> saveShares(UUID expenseId, long amountMinor, List<UUID> participantIds,
			Map<UUID, TripMember> members) {
		List<UUID> inJoinOrder = participantIds.stream()
				.sorted(Comparator.comparingLong(memberId -> members.get(memberId).getJoinOrder()))
				.toList();
		List<ExpenseShare> shares = new ArrayList<>();
		EqualSplit.split(amountMinor, inJoinOrder).forEach((memberId, share) ->
				shares.add(expenseShareRepository.save(ExpenseShare.of(expenseId, memberId, share))));
		return shares;
	}

	// 분담자·분담액은 참여 순으로 보여 준다
	private ExpenseResponse toResponse(Expense expense, List<ExpenseShare> shares, Map<UUID, TripMember> members) {
		List<ExpenseShareResponse> shareResponses = shares.stream()
				.sorted(Comparator.comparingLong(share -> members.get(share.getMemberId()).getJoinOrder()))
				.map(share -> new ExpenseShareResponse(share.getMemberId(), share.getAmountMinor()))
				.toList();
		return ExpenseResponse.of(expense, shareResponses);
	}

	// 이탈한 멤버도 과거 분담자로 보여야 하므로 상태와 관계없이 이 여행의 멤버십 전체를 읽는다
	private Map<UUID, TripMember> membersById(UUID tripId) {
		return tripMemberRepository.findAllByTripIdOrderByJoinOrder(tripId).stream()
				.collect(Collectors.toMap(TripMember::getId, Function.identity(), (a, b) -> a, LinkedHashMap::new));
	}

	private void requireActiveMember(Map<UUID, TripMember> members, UUID memberId, String field,
			List<ErrorField> errors) {
		TripMember member = members.get(memberId);
		if (member == null) {
			errors.add(new ErrorField(field, "이 여행의 동행이 아닙니다: " + memberId));
		} else if (!member.isActive()) {
			errors.add(new ErrorField(field, "여행에서 나간 동행은 새로 넣을 수 없습니다: " + memberId));
		}
	}

	private NewExpense validateCreate(CreateExpenseRequest request) {
		List<ErrorField> errors = new ArrayList<>();
		String title = validateTitle(request.title(), errors);
		validateAmount(request.amountMinor(), errors);
		if (request.currency() == null) {
			errors.add(new ErrorField("currency", "통화를 보내 주세요(KRW)."));
		}
		if (request.payerMemberId() == null) {
			errors.add(new ErrorField("payerMemberId", "결제자를 골라 주세요."));
		}
		validateParticipantList(request.participantMemberIds(), errors);
		if (request.spentAt() == null) {
			errors.add(new ErrorField("spentAt", "지출 시각을 보내 주세요."));
		}
		throwIfInvalid(errors);
		requireKrw(request.currency());
		return new NewExpense(title, normalizeMemo(request.memo()), request.amountMinor(), request.payerMemberId(),
				List.copyOf(request.participantMemberIds()), truncate(request.spentAt()));
	}

	private String validateTitle(String rawTitle, List<ErrorField> errors) {
		String title = rawTitle == null ? "" : rawTitle.strip();
		if (title.isEmpty()) {
			errors.add(new ErrorField("title", "경비 이름을 입력해 주세요."));
		} else if (title.length() > TITLE_MAX_LENGTH) {
			errors.add(new ErrorField("title", "경비 이름은 " + TITLE_MAX_LENGTH + "자 이하로 입력해 주세요."));
		}
		return title;
	}

	private void validateAmount(Long amountMinor, List<ErrorField> errors) {
		if (amountMinor == null || amountMinor <= 0) {
			errors.add(new ErrorField("amountMinor", "금액은 1원 이상의 정수로 입력해 주세요."));
		} else if (amountMinor > MAX_AMOUNT_MINOR) {
			errors.add(new ErrorField("amountMinor", "금액이 너무 큽니다."));
		}
	}

	private void validateParticipantList(List<UUID> participantIds, List<ErrorField> errors) {
		if (participantIds == null || participantIds.isEmpty()) {
			errors.add(new ErrorField("participantMemberIds", "분담자를 한 명 이상 골라 주세요."));
		} else if (participantIds.stream().anyMatch(Objects::isNull)) {
			errors.add(new ErrorField("participantMemberIds", "분담자 ID가 비어 있습니다."));
		} else if (new HashSet<>(participantIds).size() != participantIds.size()) {
			errors.add(new ErrorField("participantMemberIds", "같은 분담자를 두 번 넣을 수 없습니다."));
		}
	}

	private void requireKrw(String currency) {
		if (!Expense.CURRENCY_KRW.equals(currency)) {
			throw new BusinessException(ExpenseErrorCode.CURRENCY_MISMATCH, ExpenseErrorCode.CURRENCY_MISMATCH.message(),
					List.of(new ErrorField("currency", "KRW만 입력할 수 있습니다.")));
		}
	}

	private void throwIfInvalidParticipants(List<ErrorField> errors) {
		if (!errors.isEmpty()) {
			throw new BusinessException(ExpenseErrorCode.INVALID_PARTICIPANTS,
					ExpenseErrorCode.INVALID_PARTICIPANTS.message(), List.copyOf(errors));
		}
	}

	private void throwIfInvalid(List<ErrorField> errors) {
		if (!errors.isEmpty()) {
			throw validationError(errors);
		}
	}

	private BusinessException validationError(List<ErrorField> errors) {
		return new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
				List.copyOf(errors));
	}

	private String normalizeMemo(String memo) {
		return memo == null || memo.isBlank() ? null : memo.strip();
	}

	// DB(timestamptz)는 마이크로초까지 저장하므로 응답과 이후 조회 값이 같도록 맞춘다
	private Instant truncate(Instant instant) {
		return instant.truncatedTo(ChronoUnit.MICROS);
	}

	private Instant now() {
		return clock.instant().truncatedTo(ChronoUnit.MICROS);
	}

	private record NewExpense(String title, String memo, long amountMinor, UUID payerMemberId,
			List<UUID> participantMemberIds, Instant spentAt) {
	}

}
