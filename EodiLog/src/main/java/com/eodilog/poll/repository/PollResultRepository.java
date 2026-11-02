package com.eodilog.poll.repository;

import com.eodilog.poll.domain.PollResult;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PollResultRepository extends JpaRepository<PollResult, UUID> {

	List<PollResult> findAllByCandidateIdIn(Collection<UUID> candidateIds);

}
