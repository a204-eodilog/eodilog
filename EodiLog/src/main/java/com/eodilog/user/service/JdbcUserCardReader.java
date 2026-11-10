package com.eodilog.user.service;

import java.util.*;
import com.eodilog.user.dto.*;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class JdbcUserCardReader implements UserCardReader {

	private final NamedParameterJdbcTemplate jdbc;

	public JdbcUserCardReader(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	@Transactional(readOnly = true)
	public Map<UUID, UserCard> findCards(UUID viewerId, Collection<UUID> userIds) {
		if (userIds.isEmpty()) {
			return Map.of();
		}
		Set<UUID> ids = new LinkedHashSet<>(userIds);
		// following: viewer→카드 주인, followedBy: 카드 주인→viewer. 두 방향은 서로 독립이다
		var params = new HashMap<String, Object>();
		params.put("ids", ids);
		params.put("viewer", viewerId);
		List<UserCard> cards = jdbc.query("""
				SELECT u.id,CASE WHEN u.status='DEACTIVATED' THEN '탈퇴한 사용자' ELSE u.nickname END AS nickname,
				       CASE WHEN u.status='DEACTIVATED' THEN NULL ELSE u.profile_asset_id END AS profile_asset_id,
				       u.account_visibility,fo.status AS following_status,fb.status AS followed_by_status
				FROM users u
				LEFT JOIN follows fo ON fo.follower_user_id=:viewer AND fo.followee_user_id=u.id
				LEFT JOIN follows fb ON fb.follower_user_id=u.id AND fb.followee_user_id=:viewer
				WHERE u.id IN (:ids)
				""", params,
				(rs, n) -> new UserCard(rs.getObject("id", UUID.class), rs.getString("nickname"),
						ProfileImages.url(rs.getObject("profile_asset_id", UUID.class)),
						AccountVisibility.valueOf(rs.getString("account_visibility")),
						status(rs.getString("following_status")), status(rs.getString("followed_by_status"))));
		Map<UUID, UserCard> result = new LinkedHashMap<>();
		cards.forEach(card -> result.put(card.id(), card));
		return result;
	}

	private static FollowStatus status(String value) {
		return value == null ? FollowStatus.NONE : FollowStatus.valueOf(value);
	}
}
