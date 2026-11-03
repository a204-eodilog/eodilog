package com.eodilog.poll.repository;

import com.eodilog.poll.domain.PollCandidate;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PollCandidateRepository extends JpaRepository<PollCandidate, UUID> {

	// 후보는 입력·추가한 순서로 보여 준다
	List<PollCandidate> findAllByPollIdOrderByDisplayOrder(UUID pollId);

	List<PollCandidate> findAllByPollIdInOrderByDisplayOrder(Collection<UUID> pollIds);

}
