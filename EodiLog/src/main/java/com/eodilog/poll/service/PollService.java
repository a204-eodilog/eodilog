package com.eodilog.poll.service;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.common.response.CreatedAtCursor;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.place.service.PlaceReader;
import com.eodilog.poll.domain.Poll;
import com.eodilog.poll.domain.PollCandidate;
import com.eodilog.poll.domain.PollStatus;
import com.eodilog.poll.domain.PollType;
import com.eodilog.poll.domain.PollVote;
import com.eodilog.poll.dto.AddCandidateRequest;
import com.eodilog.poll.dto.BallotRequest;
import com.eodilog.poll.dto.CandidateInput;
import com.eodilog.poll.dto.ClosePollRequest;
import com.eodilog.poll.dto.CreatePollRequest;
import com.eodilog.poll.dto.PollResponse;
import com.eodilog.poll.exception.PollErrorCode;
import com.eodilog.poll.repository.PollCandidateRepository;
import com.eodilog.poll.repository.PollRepository;
import com.eodilog.poll.repository.PollVoteRepository;
import com.eodilog.region.service.RegionReader;
import com.eodilog.trip.service.TripAccess;
import com.eodilog.trip.service.TripAccessChecker;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

// 여행 안 지역·장소 투표(명세 §6, 정책 §13). ACTIVE 멤버 누구나 열고·투표하고·후보를 추가하고, 연 사람은 직접 종료한다
// 조회·쓰기 모두 먼저 마감 시각이 지난 투표를 따로 커밋해 마감한 뒤 요청을 처리한다(V-12 지연 마감)
// 마감을 요청 트랜잭션과 나눠야 요청이 409·400으로 롤백돼도 마감이 남는다. 그래서 메서드마다 트랜잭션을 직접 연다
@Service
public class PollService {

	public static final int DEFAULT_LIMIT = 20;
	public static final int MAX_LIMIT = 100;

	private static final int TITLE_MAX_LENGTH = 200;
	private static final int MAX_CANDIDATES = 30;
	private static final Duration MAX_OPEN_PERIOD = Duration.ofDays(30);

	private final PollRepository pollRepository;
	private final PollCandidateRepository pollCandidateRepository;
	private final PollVoteRepository pollVoteRepository;
	private final PollCloser pollCloser;
	private final PollNotifier pollNotifier;
	private final PollResponseAssembler pollResponseAssembler;
	private final TripAccessChecker tripAccessChecker;
	private final RegionReader regionReader;
	private final PlaceReader placeReader;
	private final EntityManager entityManager;
	private final Clock clock;
	private final TransactionTemplate readTransaction;
	private final TransactionTemplate writeTransaction;

	public PollService(PollRepository pollRepository, PollCandidateRepository pollCandidateRepository,
			PollVoteRepository pollVoteRepository, PollCloser pollCloser, PollNotifier pollNotifier,
			PollResponseAssembler pollResponseAssembler,
			TripAccessChecker tripAccessChecker, RegionReader regionReader, PlaceReader placeReader,
			EntityManager entityManager, Clock clock, PlatformTransactionManager transactionManager) {
		this.pollRepository = pollRepository;
		this.pollCandidateRepository = pollCandidateRepository;
		this.pollVoteRepository = pollVoteRepository;
		this.pollCloser = pollCloser;
		this.pollNotifier = pollNotifier;
		this.pollResponseAssembler = pollResponseAssembler;
		this.tripAccessChecker = tripAccessChecker;
		this.regionReader = regionReader;
		this.placeReader = placeReader;
		this.entityManager = entityManager;
		this.clock = clock;
		this.readTransaction = new TransactionTemplate(transactionManager);
		this.readTransaction.setReadOnly(true);
		this.writeTransaction = new TransactionTemplate(transactionManager);
	}

	// 최근 생성 순(createdAt DESC, id DESC)
	public PageResponse<PollResponse> getPolls(UUID userId, UUID tripId, String cursor, int limit) {
		pollCloser.closeDuePollsNow(tripId);
		return readTransaction.execute(status -> findPolls(userId, tripId, cursor, limit));
	}

	private PageResponse<PollResponse> findPolls(UUID userId, UUID tripId, String cursor, int limit) {
		TripAccess access = tripAccessChecker.requireActiveMember(tripId, userId);
		CreatedAtCursor after = cursor == null || cursor.isBlank() ? null : CreatedAtCursor.decode(cursor);

		String jpql = "select p from Poll p where p.tripId = :tripId"
				+ (after == null ? "" : " and (p.createdAt < :cursorCreatedAt or (p.createdAt = :cursorCreatedAt and p.id < :cursorId))")
				+ " order by p.createdAt desc, p.id desc";
		TypedQuery<Poll> query = entityManager.createQuery(jpql, Poll.class)
				.setParameter("tripId", tripId)
				.setMaxResults(limit + 1);
		if (after != null) {
			query.setParameter("cursorCreatedAt", after.createdAt()).setParameter("cursorId", after.id());
		}
		List<Poll> found = query.getResultList();
		boolean hasNext = found.size() > limit;
		List<Poll> page = hasNext ? found.subList(0, limit) : found;
		String nextCursor = hasNext
				? new CreatedAtCursor(page.getLast().getCreatedAt(), page.getLast().getId()).encode()
				: null;
		return PageResponse.of(pollResponseAssembler.assemble(page, access.member().getId()), nextCursor, hasNext);
	}

	public PollResponse getPoll(UUID userId, UUID tripId, UUID pollId) {
		pollCloser.closeDuePollsNow(tripId);
		return readTransaction.execute(status -> {
			TripAccess access = tripAccessChecker.requireActiveMember(tripId, userId);
			Poll poll = pollRepository.findByIdAndTripId(pollId, tripId)
					.orElseThrow(() -> new BusinessException(PollErrorCode.POLL_NOT_FOUND));
			return pollResponseAssembler.assemble(poll, access.member().getId());
		});
	}

	// 명세 §2 멱등 목록에 없어 Idempotency-Key를 받지 않는다(V-6). 여행 행을 잠가 나가기와 엇갈리지 않게 한다
	public PollResponse createPoll(UUID userId, UUID tripId, CreatePollRequest request) {
		NewPoll newPoll = validateCreate(request);
		return writeTransaction.execute(status -> create(userId, tripId, newPoll));
	}

	private PollResponse create(UUID userId, UUID tripId, NewPoll newPoll) {
		TripAccess access = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId);
		Instant now = now();
		Poll poll = pollRepository.save(Poll.open(tripId, access.member().getId(), newPoll.type(), newPoll.title(),
				newPoll.closesAt(), now));
		for (int order = 0; order < newPoll.targetIds().size(); order++) {
			pollCandidateRepository.save(
					PollCandidate.of(poll.getId(), newPoll.type(), newPoll.targetIds().get(order), order, now));
		}
		pollNotifier.opened(poll, userId);
		return pollResponseAssembler.assemble(poll, access.member().getId());
	}

	// 내 선택 전체 교체, 빈 배열은 취소(V-7). 다른 멤버의 투표로는 version이 오르지 않는다(V-8)
	public PollResponse replaceBallot(UUID userId, UUID tripId, UUID pollId, BallotRequest request) {
		List<ErrorField> errors = new ArrayList<>();
		List<UUID> candidateIds = request.candidateIds();
		if (candidateIds == null) {
			errors.add(new ErrorField("candidateIds", "고를 후보를 보내 주세요. 취소하려면 빈 배열([])을 보내 주세요."));
		} else if (candidateIds.stream().anyMatch(Objects::isNull)) {
			errors.add(new ErrorField("candidateIds", "후보 ID가 비어 있습니다."));
		} else if (new HashSet<>(candidateIds).size() != candidateIds.size()) {
			errors.add(new ErrorField("candidateIds", "같은 후보를 두 번 고를 수 없습니다."));
		}
		requireExpectedVersion(request.expectedVersion(), errors);
		throwIfInvalid(errors);

		pollCloser.closeDuePollsNow(tripId);
		return writeTransaction.execute(status -> vote(userId, tripId, pollId, candidateIds, request.expectedVersion()));
	}

	private PollResponse vote(UUID userId, UUID tripId, UUID pollId, List<UUID> candidateIds, long expectedVersion) {
		TripAccess access = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId);
		Poll poll = requireWritablePoll(tripId, pollId, expectedVersion);
		Set<UUID> pollCandidateIds = pollCandidateRepository.findAllByPollIdOrderByDisplayOrder(pollId).stream()
				.map(PollCandidate::getId).collect(Collectors.toSet());
		if (!pollCandidateIds.containsAll(candidateIds)) {
			throw validationError(List.of(new ErrorField("candidateIds", "이 투표의 후보가 아닌 ID가 있습니다.")));
		}

		UUID memberId = access.member().getId();
		Instant now = now();
		pollVoteRepository.deleteMyVotes(pollId, memberId);
		candidateIds.forEach(candidateId -> pollVoteRepository.save(PollVote.of(candidateId, memberId, now)));
		return pollResponseAssembler.assemble(poll, memberId);
	}

	// 진행 중인 투표에 후보를 하나 더한다(V-10). 성공하면 version이 올라 그 전에 본 화면의 투표는 409를 받는다
	public PollResponse addCandidate(UUID userId, UUID tripId, UUID pollId, AddCandidateRequest request) {
		List<ErrorField> errors = new ArrayList<>();
		CandidateInput candidate = request.candidate();
		UUID targetId = null;
		if (candidate == null) {
			errors.add(new ErrorField("candidate", "추가할 후보를 보내 주세요."));
		} else if ((candidate.regionId() == null) == (candidate.placeId() == null)) {
			errors.add(new ErrorField("candidate", "regionId와 placeId 중 하나만 보내 주세요."));
		} else {
			PollType type = candidate.regionId() != null ? PollType.REGION : PollType.PLACE;
			targetId = type == PollType.REGION ? candidate.regionId() : candidate.placeId();
			if (!missingTargets(type, List.of(targetId)).isEmpty()) {
				errors.add(new ErrorField("candidate", missingMessage(type)));
			}
		}
		requireExpectedVersion(request.expectedVersion(), errors);
		throwIfInvalid(errors);

		PollType requestedType = candidate.regionId() != null ? PollType.REGION : PollType.PLACE;
		pollCloser.closeDuePollsNow(tripId);
		UUID newTargetId = targetId;
		return writeTransaction.execute(status ->
				add(userId, tripId, pollId, requestedType, newTargetId, request.expectedVersion()));
	}

	private PollResponse add(UUID userId, UUID tripId, UUID pollId, PollType requestedType, UUID targetId,
			long expectedVersion) {
		TripAccess access = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId);
		Poll poll = requireWritablePoll(tripId, pollId, expectedVersion);
		if (requestedType != poll.getType()) {
			throw validationError(List.of(new ErrorField("candidate", poll.getType() == PollType.REGION
					? "지역 투표에는 regionId만 넣을 수 있습니다." : "장소 투표에는 placeId만 넣을 수 있습니다.")));
		}
		List<PollCandidate> candidates = pollCandidateRepository.findAllByPollIdOrderByDisplayOrder(pollId);
		if (candidates.stream().anyMatch(existing -> existing.targetId().equals(targetId))) {
			throw validationError(List.of(new ErrorField("candidate", "이미 있는 후보입니다.")));
		}
		if (candidates.size() >= MAX_CANDIDATES) {
			throw validationError(List.of(new ErrorField("candidate",
					"후보는 " + MAX_CANDIDATES + "개까지 넣을 수 있습니다.")));
		}

		PollCandidate added = pollCandidateRepository.save(
				PollCandidate.of(pollId, poll.getType(), targetId, candidates.size(), now()));
		poll.markCandidateAdded();
		pollNotifier.candidateAdded(poll, added.getId(), userId);
		return pollResponseAssembler.assemble(poll, access.member().getId());
	}

	// 투표를 연 사람이 마감 시각 전에 직접 종료한다(V-16). 결과는 시각 마감과 같다: 최다 후보 모두 확정, 0표면 확정 없이 마감
	// 판정 순서: 입력 400 → 여행 ACTIVE 404 → 투표 404 → 연 사람 아님 403 → 마감 409 POLL_CLOSED → version 409
	// 투표·후보 추가와 같이 여행 행을 먼저 잠가, 종료 전에 커밋된 표는 집계에 들어가고 종료 뒤의 표는 409가 된다
	public PollResponse closePoll(UUID userId, UUID tripId, UUID pollId, ClosePollRequest request) {
		List<ErrorField> errors = new ArrayList<>();
		requireExpectedVersion(request.expectedVersion(), errors);
		throwIfInvalid(errors);

		pollCloser.closeDuePollsNow(tripId);
		return writeTransaction.execute(status -> close(userId, tripId, pollId, request.expectedVersion()));
	}

	private PollResponse close(UUID userId, UUID tripId, UUID pollId, long expectedVersion) {
		TripAccess access = tripAccessChecker.requireActiveMemberForUpdate(tripId, userId);
		UUID memberId = access.member().getId();
		Poll poll = lockPoll(tripId, pollId);
		if (!poll.isCreatedBy(memberId)) {
			throw new BusinessException(CommonErrorCode.FORBIDDEN, "투표를 연 사람만 종료할 수 있습니다.");
		}
		requireOpenVersion(poll, expectedVersion);
		pollCloser.closeByCreator(access.trip(), poll, new PollCloser.Closer(memberId, userId));
		return pollResponseAssembler.assemble(poll, memberId);
	}

	// 판정 순서: 투표 404 → 마감 409 POLL_CLOSED → version 409(V-3)
	private Poll requireWritablePoll(UUID tripId, UUID pollId, long expectedVersion) {
		Poll poll = lockPoll(tripId, pollId);
		requireOpenVersion(poll, expectedVersion);
		return poll;
	}

	private Poll lockPoll(UUID tripId, UUID pollId) {
		return pollRepository.findByIdAndTripIdForUpdate(pollId, tripId)
				.orElseThrow(() -> new BusinessException(PollErrorCode.POLL_NOT_FOUND));
	}

	// 마감 시각이 지난 투표는 요청 전에 마감했고, 그 사이 마감 시각이 된 투표는 OPEN이어도 쓰기를 거부한다
	// (다음 조회·주기 마감이 마감한다)
	private void requireOpenVersion(Poll poll, long expectedVersion) {
		if (poll.getStatus() != PollStatus.OPEN || poll.isDue(now())) {
			throw new BusinessException(PollErrorCode.POLL_CLOSED);
		}
		if (poll.getVersion() != expectedVersion) {
			throw new BusinessException(PollErrorCode.VERSION_CONFLICT);
		}
	}

	// 모든 입력 오류를 한 번에 알린다. 후보 존재 확인까지 입력 검증이다(V-2·V-4·V-5)
	private NewPoll validateCreate(CreatePollRequest request) {
		List<ErrorField> errors = new ArrayList<>();
		PollType type = request.type();
		if (type == null) {
			errors.add(new ErrorField("type", "투표 유형(REGION 또는 PLACE)을 골라 주세요."));
		}
		String title = request.title() == null ? "" : request.title().strip();
		if (title.isEmpty()) {
			errors.add(new ErrorField("title", "투표 제목을 입력해 주세요."));
		} else if (title.length() > TITLE_MAX_LENGTH) {
			errors.add(new ErrorField("title", "투표 제목은 " + TITLE_MAX_LENGTH + "자 이하로 입력해 주세요."));
		}
		List<UUID> targetIds = validateCandidates(type, request.candidates(), errors);
		Instant now = now();
		Instant closesAt = request.closesAt() == null ? null : request.closesAt().truncatedTo(ChronoUnit.MICROS);
		if (closesAt == null) {
			errors.add(new ErrorField("closesAt", "마감 시각을 보내 주세요."));
		} else if (!closesAt.isAfter(now)) {
			errors.add(new ErrorField("closesAt", "마감 시각은 지금보다 이후여야 합니다."));
		} else if (closesAt.isAfter(now.plus(MAX_OPEN_PERIOD))) {
			errors.add(new ErrorField("closesAt", "마감 시각은 " + MAX_OPEN_PERIOD.toDays() + "일 이내로 정해 주세요."));
		}
		throwIfInvalid(errors);
		return new NewPoll(type, title, targetIds, closesAt);
	}

	private List<UUID> validateCandidates(PollType type, List<CandidateInput> candidates, List<ErrorField> errors) {
		if (candidates == null || candidates.isEmpty()) {
			errors.add(new ErrorField("candidates", "후보를 1개 이상 넣어 주세요."));
			return List.of();
		}
		if (candidates.size() > MAX_CANDIDATES) {
			errors.add(new ErrorField("candidates", "후보는 " + MAX_CANDIDATES + "개까지 넣을 수 있습니다."));
			return List.of();
		}
		if (type == null) {
			return List.of();
		}
		List<UUID> targetIds = new ArrayList<>();
		int errorCount = errors.size();
		for (int i = 0; i < candidates.size(); i++) {
			CandidateInput candidate = candidates.get(i);
			UUID targetId = candidate == null ? null : type == PollType.REGION ? candidate.regionId() : candidate.placeId();
			UUID otherId = candidate == null ? null : type == PollType.REGION ? candidate.placeId() : candidate.regionId();
			if (targetId == null || otherId != null) {
				errors.add(new ErrorField("candidates[" + i + "]", type == PollType.REGION
						? "지역 투표 후보에는 regionId만 넣어 주세요." : "장소 투표 후보에는 placeId만 넣어 주세요."));
			} else {
				targetIds.add(targetId);
			}
		}
		if (errors.size() > errorCount) {
			return List.of();
		}
		if (new HashSet<>(targetIds).size() != targetIds.size()) {
			errors.add(new ErrorField("candidates", "같은 후보를 두 번 넣을 수 없습니다."));
			return List.of();
		}
		Set<UUID> missing = missingTargets(type, targetIds);
		for (int i = 0; i < targetIds.size(); i++) {
			if (missing.contains(targetIds.get(i))) {
				errors.add(new ErrorField("candidates[" + i + "]", missingMessage(type)));
			}
		}
		return targetIds;
	}

	// 지역은 A의 RegionReader, 장소는 PlaceReader로 존재만 확인한다. 없는 ID는 다른 자원을 가리키는 입력이라 400이다(V-2)
	private Set<UUID> missingTargets(PollType type, List<UUID> targetIds) {
		Set<UUID> found = type == PollType.REGION
				? regionReader.findAll(targetIds).keySet()
				: placeReader.findAll(targetIds).keySet();
		return targetIds.stream().filter(id -> !found.contains(id)).collect(Collectors.toSet());
	}

	private String missingMessage(PollType type) {
		return type == PollType.REGION ? "존재하지 않는 지역입니다." : "존재하지 않는 장소입니다.";
	}

	private void requireExpectedVersion(Long expectedVersion, List<ErrorField> errors) {
		if (expectedVersion == null) {
			errors.add(new ErrorField("expectedVersion", "조회한 투표의 version을 보내 주세요."));
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

	private Instant now() {
		return clock.instant().truncatedTo(ChronoUnit.MICROS);
	}

	private record NewPoll(PollType type, String title, List<UUID> targetIds, Instant closesAt) {
	}

}
