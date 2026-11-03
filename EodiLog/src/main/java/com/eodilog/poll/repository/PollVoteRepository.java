package com.eodilog.poll.repository;

import com.eodilog.poll.domain.PollVote;
import com.eodilog.poll.domain.PollVoteId;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PollVoteRepository extends JpaRepository<PollVote, PollVoteId> {

	// 내 선택 교체의 첫 단계. 이 투표에서 내가 던진 표를 모두 지운다
	@Modifying(flushAutomatically = true, clearAutomatically = false)
	@Query("delete from PollVote v where v.memberId = :memberId"
			+ " and v.candidateId in (select c.id from PollCandidate c where c.pollId = :pollId)")
	int deleteMyVotes(@Param("pollId") UUID pollId, @Param("memberId") UUID memberId);

}
