package com.eodilog.poll.service;

import com.eodilog.poll.domain.Poll;
import com.eodilog.poll.domain.PollCandidate;
import com.eodilog.poll.domain.PollResult;
import com.eodilog.poll.domain.PollStatus;
import com.eodilog.poll.domain.PollType;
import com.eodilog.poll.repository.PollCandidateRepository;
import com.eodilog.poll.repository.PollResultRepository;
import com.eodilog.poll.repository.PollTallyRepository;
import com.eodilog.trip.domain.Trip;
import com.eodilog.trip.domain.TripDestination;
import com.eodilog.trip.domain.TripInfoChangedEvent;
import com.eodilog.trip.domain.TripMemberStatus;
import com.eodilog.trip.repository.TripDestinationRepository;
import com.eodilog.trip.repository.TripMemberRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

// 마감 시각이 지난 OPEN 투표를 마감한다. 조회·쓰기 때의 지연 마감과 주기 마감이 같은 규칙을 쓴다(정책 §13 V-12)
// 잠금은 항상 여행 행 → 투표 행 순서다. 지역 확정이 여행 행(여행지·version)을 바꾸고, 다른 쓰기도 여행 행을 먼저 잡기 때문이다
@Component
public class PollCloser {

	private final PollTallyRepository pollTallyRepository;
	private final PollCandidateRepository pollCandidateRepository;
	private final PollResultRepository pollResultRepository;
	private final TripMemberRepository tripMemberRepository;
	private final TripDestinationRepository tripDestinationRepository;
	private final PollNotifier pollNotifier;
	private final ApplicationEventPublisher eventPublisher;
	private final EntityManager entityManager;
	private final Clock clock;
	private final TransactionTemplate transactionTemplate;

	public PollCloser(PollTallyRepository pollTallyRepository, PollCandidateRepository pollCandidateRepository,
			PollResultRepository pollResultRepository, TripMemberRepository tripMemberRepository,
			TripDestinationRepository tripDestinationRepository, PollNotifier pollNotifier,
			ApplicationEventPublisher eventPublisher,
			EntityManager entityManager, Clock clock, PlatformTransactionManager transactionManager) {
		this.pollTallyRepository = pollTallyRepository;
		this.pollCandidateRepository = pollCandidateRepository;
		this.pollResultRepository = pollResultRepository;
		this.tripMemberRepository = tripMemberRepository;
		this.tripDestinationRepository = tripDestinationRepository;
		this.pollNotifier = pollNotifier;
		this.eventPublisher = eventPublisher;
		this.entityManager = entityManager;
		this.clock = clock;
		this.transactionTemplate = new TransactionTemplate(transactionManager);
	}

	// 투표 API가 요청을 처리하기 전에 따로 커밋한다. 요청이 409·400으로 롤백돼도 마감은 남는다(V-9)
	// 트랜잭션 안에서 부르면 바깥이 잡은 여행 행 잠금을 새 트랜잭션이 기다려 멈추므로 막는다
	public void closeDuePollsNow(UUID tripId) {
		if (TransactionSynchronizationManager.isActualTransactionActive()) {
			throw new IllegalStateException("closeDuePollsNow must run outside a transaction");
		}
		if (!pollTallyRepository.hasDuePoll(tripId, now())) {
			return;
		}
		transactionTemplate.executeWithoutResult(status -> closeDuePolls(tripId));
	}

	// 호출한 트랜잭션 안에서 마감한다. 멤버 변동(나가기·내보내기·초대 수락)은 멤버십을 바꾸기 전에 불러
	// 마감 시각까지의 멤버로 집계되게 한다. 이 여행의 투표 엔티티를 읽기 전에 부른다. 잠금 뒤 다시 읽은 상태로 판단해야 같은 투표를 두 번 마감하지 않는다
	@Transactional(propagation = Propagation.MANDATORY)
	public void closeDuePolls(UUID tripId) {
		Instant now = now();
		if (!pollTallyRepository.hasDuePoll(tripId, now)) {
			return;
		}
		// 권한 검사에서 잠금 없이 읽은 여행일 수 있으므로 잠그면서 다시 읽는다
		Trip trip = entityManager.find(Trip.class, tripId);
		if (trip == null) {
			return;
		}
		entityManager.refresh(trip, LockModeType.PESSIMISTIC_WRITE);
		if (trip.getDeletedAt() != null) {
			return;
		}
		List<Poll> duePolls = entityManager.createQuery("select p from Poll p where p.tripId = :tripId"
						+ " and p.status = :open and p.closesAt <= :now order by p.createdAt, p.id", Poll.class)
				.setParameter("tripId", tripId)
				.setParameter("open", PollStatus.OPEN)
				.setParameter("now", now)
				.setLockMode(LockModeType.PESSIMISTIC_WRITE)
				.getResultList();
		for (Poll poll : duePolls) {
			close(trip, poll, now);
		}
		entityManager.flush();
	}

	// 지금 ACTIVE인 멤버의 표로 집계해 고정한다(V-6d). 표가 있으면 최다 후보를 모두 확정, 0표면 확정 없이 마감(V-13)
	private void close(Trip trip, Poll poll, Instant now) {
		List<PollCandidate> candidates = pollCandidateRepository.findAllByPollIdOrderByDisplayOrder(poll.getId());
		Map<UUID, Integer> voteCounts = pollTallyRepository.activeVoteCounts(List.of(poll.getId()));
		int votedMemberCount = pollTallyRepository.activeVoterCounts(List.of(poll.getId()))
				.getOrDefault(poll.getId(), 0);
		int eligibleMemberCount = (int) tripMemberRepository.countByTripIdAndStatus(trip.getId(),
				TripMemberStatus.ACTIVE);
		candidates.forEach(candidate -> candidate.fixVoteCount(voteCounts.getOrDefault(candidate.getId(), 0)));

		if (votedMemberCount == 0) {
			poll.closeWithoutVotes(eligibleMemberCount, now);
			pollNotifier.closed(poll, false);
			return;
		}
		int maxVotes = candidates.stream().mapToInt(PollCandidate::getVoteCount).max().orElse(0);
		List<PollCandidate> selected = candidates.stream()
				.filter(candidate -> candidate.getVoteCount() == maxVotes)
				.toList();
		selected.forEach(candidate -> pollResultRepository.save(PollResult.of(candidate.getId(), now)));
		poll.finalizeResult(eligibleMemberCount, votedMemberCount, now);
		pollNotifier.closed(poll, true);
		if (poll.getType() == PollType.REGION) {
			addDestinations(trip, selected, now);
		}
	}

	// 확정 지역을 여행지 끝에 추가하고 이미 있는 지역은 건너뛴다(V-14). 장소 확정은 코스를 바꾸지 않는다
	private void addDestinations(Trip trip, List<PollCandidate> selected, Instant now) {
		List<TripDestination> current = tripDestinationRepository.findAllByTripIdOrderByDisplayOrder(trip.getId());
		Set<UUID> regionIds = new HashSet<>();
		current.forEach(destination -> regionIds.add(destination.getRegionId()));
		int nextOrder = current.isEmpty() ? 0 : current.getLast().getDisplayOrder() + 1;
		boolean added = false;
		for (PollCandidate candidate : selected) {
			if (regionIds.add(candidate.getRegionId())) {
				tripDestinationRepository.save(
						TripDestination.of(trip.getId(), candidate.getRegionId(), nextOrder++, candidate.getId()));
				added = true;
			}
		}
		if (added) {
			trip.markDestinationsChanged(now);
			eventPublisher.publishEvent(new TripInfoChangedEvent(trip.getId(), null, Set.of("destinationRegionIds"),
					trip.getVersion(), now));
		}
	}

	private Instant now() {
		return clock.instant().truncatedTo(ChronoUnit.MICROS);
	}

}
