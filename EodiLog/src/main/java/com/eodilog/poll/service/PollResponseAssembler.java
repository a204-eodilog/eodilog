package com.eodilog.poll.service;

import com.eodilog.poll.domain.Poll;
import com.eodilog.poll.domain.PollCandidate;
import com.eodilog.poll.domain.PollResult;
import com.eodilog.poll.domain.PollStatus;
import com.eodilog.poll.dto.PollCandidateResponse;
import com.eodilog.poll.dto.PollResponse;
import com.eodilog.poll.repository.PollCandidateRepository;
import com.eodilog.poll.repository.PollResultRepository;
import com.eodilog.poll.repository.PollTallyRepository;
import com.eodilog.trip.domain.TripMemberStatus;
import com.eodilog.trip.repository.TripMemberRepository;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

// 같은 여행의 투표 여러 개를 한 번에 응답으로 만든다. 진행 중이면 지금 ACTIVE 멤버로 세고, 마감했으면 고정한 값을 쓴다(V-6c·V-6d)
@Component
@RequiredArgsConstructor
public class PollResponseAssembler {

	private final PollCandidateRepository pollCandidateRepository;
	private final PollResultRepository pollResultRepository;
	private final PollTallyRepository pollTallyRepository;
	private final TripMemberRepository tripMemberRepository;
	private final EntityManager entityManager;
	private final Clock clock;

	public PollResponse assemble(Poll poll, UUID memberId) {
		return assemble(List.of(poll), memberId).getFirst();
	}

	public List<PollResponse> assemble(List<Poll> polls, UUID memberId) {
		if (polls.isEmpty()) {
			return List.of();
		}
		// 집계는 JDBC로 읽으므로 같은 트랜잭션에서 바꾼 표·후보를 먼저 반영한다
		entityManager.flush();
		List<UUID> pollIds = polls.stream().map(Poll::getId).toList();
		Map<UUID, List<PollCandidate>> candidatesByPoll = pollCandidateRepository
				.findAllByPollIdInOrderByDisplayOrder(pollIds).stream()
				.collect(Collectors.groupingBy(PollCandidate::getPollId));
		List<UUID> openPollIds = polls.stream().filter(poll -> poll.getStatus() == PollStatus.OPEN)
				.map(Poll::getId).toList();
		Map<UUID, Integer> openVoteCounts = pollTallyRepository.activeVoteCounts(openPollIds);
		Map<UUID, Integer> openVoterCounts = pollTallyRepository.activeVoterCounts(openPollIds);
		int activeMemberCount = openPollIds.isEmpty() ? 0
				: (int) tripMemberRepository.countByTripIdAndStatus(polls.getFirst().getTripId(), TripMemberStatus.ACTIVE);
		Map<UUID, List<UUID>> myCandidateIds = pollTallyRepository.myCandidateIds(pollIds, memberId);
		List<UUID> finalizedCandidateIds = polls.stream().filter(poll -> poll.getStatus() == PollStatus.FINALIZED)
				.flatMap(poll -> candidatesByPoll.getOrDefault(poll.getId(), List.of()).stream())
				.map(PollCandidate::getId).toList();
		Set<UUID> selected = finalizedCandidateIds.isEmpty() ? Set.of()
				: pollResultRepository.findAllByCandidateIdIn(finalizedCandidateIds).stream()
						.map(PollResult::getCandidateId).collect(Collectors.toSet());

		Instant now = clock.instant();
		return polls.stream().map(poll -> {
			List<PollCandidate> candidates = candidatesByPoll.getOrDefault(poll.getId(), List.of());
			boolean open = poll.getStatus() == PollStatus.OPEN;
			List<PollCandidateResponse> candidateResponses = candidates.stream()
					.map(candidate -> new PollCandidateResponse(candidate.getId(), candidate.getRegionId(),
							candidate.getPlaceId(),
							open ? openVoteCounts.getOrDefault(candidate.getId(), 0) : candidate.getVoteCount(),
							candidate.getCreatedAt()))
					.toList();
			List<UUID> selectedIds = candidates.stream().map(PollCandidate::getId).filter(selected::contains).toList();
			// 종료 버튼 표시용. 실제 종료 요청은 잠금 뒤 같은 조건을 다시 확인한다(V-16)
			boolean canClose = open && !poll.isDue(now) && poll.isCreatedBy(memberId);
			return new PollResponse(poll.getId(), poll.getTripId(), poll.getType(), poll.getTitle(), poll.getStatus(),
					poll.getVersion(), poll.getClosesAt(), poll.getClosedReason(), poll.getClosedAt(),
					poll.getClosedByMemberId(),
					open ? activeMemberCount : poll.getEligibleMemberCount(),
					open ? openVoterCounts.getOrDefault(poll.getId(), 0) : poll.getVotedMemberCount(),
					candidateResponses, myCandidateIds.getOrDefault(poll.getId(), List.of()), selectedIds,
					poll.getCreatedByMemberId(), canClose);
		}).toList();
	}

}
