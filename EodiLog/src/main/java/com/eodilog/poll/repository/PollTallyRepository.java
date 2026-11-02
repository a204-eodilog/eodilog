package com.eodilog.poll.repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

// OPEN 투표의 집계와 내 선택을 읽는다. 지금 ACTIVE인 멤버의 표만 센다(V-6b). 마감한 투표는 저장한 값을 쓴다
@Repository
public class PollTallyRepository {

	private final NamedParameterJdbcTemplate jdbc;

	public PollTallyRepository(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	// 후보별 득표 수. 표가 없는 후보는 결과에 없다
	public Map<UUID, Integer> activeVoteCounts(Collection<UUID> pollIds) {
		Map<UUID, Integer> counts = new HashMap<>();
		if (pollIds.isEmpty()) {
			return counts;
		}
		jdbc.query("""
				SELECT v.candidate_id, count(*) AS votes
				FROM poll_votes v
				JOIN poll_candidates c ON c.id = v.candidate_id
				JOIN trip_members m ON m.id = v.member_id AND m.status = 'ACTIVE'
				WHERE c.poll_id IN (:pollIds)
				GROUP BY v.candidate_id""", Map.of("pollIds", pollIds),
				rs -> {
					counts.put(rs.getObject("candidate_id", UUID.class), rs.getInt("votes"));
				});
		return counts;
	}

	// 투표별로 한 표 이상 던진 ACTIVE 멤버 수. 표가 없는 투표는 결과에 없다
	public Map<UUID, Integer> activeVoterCounts(Collection<UUID> pollIds) {
		Map<UUID, Integer> counts = new HashMap<>();
		if (pollIds.isEmpty()) {
			return counts;
		}
		jdbc.query("""
				SELECT c.poll_id, count(DISTINCT v.member_id) AS voters
				FROM poll_votes v
				JOIN poll_candidates c ON c.id = v.candidate_id
				JOIN trip_members m ON m.id = v.member_id AND m.status = 'ACTIVE'
				WHERE c.poll_id IN (:pollIds)
				GROUP BY c.poll_id""", Map.of("pollIds", pollIds),
				rs -> {
					counts.put(rs.getObject("poll_id", UUID.class), rs.getInt("voters"));
				});
		return counts;
	}

	// 투표별 내가 고른 후보. 후보 순서(display_order)다
	public Map<UUID, List<UUID>> myCandidateIds(Collection<UUID> pollIds, UUID memberId) {
		Map<UUID, List<UUID>> mine = new LinkedHashMap<>();
		if (pollIds.isEmpty()) {
			return mine;
		}
		jdbc.query("""
				SELECT c.poll_id, c.id
				FROM poll_votes v
				JOIN poll_candidates c ON c.id = v.candidate_id
				WHERE c.poll_id IN (:pollIds) AND v.member_id = :memberId
				ORDER BY c.display_order""", Map.of("pollIds", pollIds, "memberId", memberId),
				rs -> {
					mine.computeIfAbsent(rs.getObject("poll_id", UUID.class), id -> new ArrayList<>())
							.add(rs.getObject("id", UUID.class));
				});
		return mine;
	}

	// 마감 시각이 지난 OPEN 투표가 있는 여행. 주기 마감이 여행마다 따로 처리한다(V-12)
	public List<UUID> tripIdsWithDuePolls(Instant now, int limit) {
		return jdbc.queryForList("""
				SELECT DISTINCT p.trip_id
				FROM polls p
				JOIN trips t ON t.id = p.trip_id AND t.deleted_at IS NULL
				WHERE p.status = 'OPEN' AND p.closes_at <= :now
				LIMIT :limit""", Map.of("now", Timestamp.from(now), "limit", limit), UUID.class);
	}

	// 지연 마감 전에 잠금 없이 확인한다. 마감할 투표가 없으면 여행 행을 잠그지 않는다
	public boolean hasDuePoll(UUID tripId, Instant now) {
		Boolean exists = jdbc.queryForObject("""
				SELECT EXISTS (SELECT 1 FROM polls WHERE trip_id = :tripId AND status = 'OPEN' AND closes_at <= :now)""",
				Map.of("tripId", tripId, "now", Timestamp.from(now)), Boolean.class);
		return Boolean.TRUE.equals(exists);
	}

}
