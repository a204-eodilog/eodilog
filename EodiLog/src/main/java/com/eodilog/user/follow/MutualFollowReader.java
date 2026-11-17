package com.eodilog.user.follow;

import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

// 맞팔(서로 팔로우) 판정. 두 방향이 모두 ACCEPTED일 때만 맞팔이며 REQUESTED는 넣지 않는다.
// 상대는 활동 중인 가입 완료 회원이어야 한다(FollowService.USABLE_USER와 같은 기준)
@Component
public class MutualFollowReader {

	private final JdbcTemplate jdbc;

	public MutualFollowReader(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	@Transactional(readOnly = true)
	public boolean isMutual(UUID me, UUID other) {
		if (me.equals(other)) return false;
		Boolean mutual = jdbc.queryForObject("""
				SELECT EXISTS (
				  SELECT 1 FROM follows f1
				  JOIN follows f2 ON f2.follower_user_id=f1.followee_user_id AND f2.followee_user_id=f1.follower_user_id
				    AND f2.status='ACCEPTED'
				  JOIN users u ON u.id=f1.followee_user_id
				  WHERE f1.follower_user_id=? AND f1.followee_user_id=? AND f1.status='ACCEPTED'
				    AND u.status='ACTIVE' AND u.profile_completed)
				""", Boolean.class, me, other);
		return Boolean.TRUE.equals(mutual);
	}

	// 닉네임·ID 순으로 최대 limit명
	@Transactional(readOnly = true)
	public List<UUID> mutualIds(UUID me, int limit) {
		return jdbc.queryForList("""
				SELECT f1.followee_user_id FROM follows f1
				JOIN follows f2 ON f2.follower_user_id=f1.followee_user_id AND f2.followee_user_id=f1.follower_user_id
				  AND f2.status='ACCEPTED'
				JOIN users u ON u.id=f1.followee_user_id
				WHERE f1.follower_user_id=? AND f1.status='ACCEPTED' AND u.status='ACTIVE' AND u.profile_completed
				ORDER BY u.nickname, u.id
				LIMIT ?
				""", UUID.class, me, limit);
	}

}
