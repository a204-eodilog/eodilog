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
		List<UserCard> cards = jdbc.query(
                "SELECT id,CASE WHEN status='DEACTIVATED' THEN '탈퇴한 사용자' ELSE nickname END AS nickname,account_visibility FROM users WHERE id IN (:ids)", Map.of("ids", ids),
				(rs, n) -> new UserCard(rs.getObject("id", UUID.class), rs.getString("nickname"), null,
						AccountVisibility.valueOf(rs.getString("account_visibility")), FollowStatus.NONE, FollowStatus.NONE));
		Map<UUID, UserCard> result = new LinkedHashMap<>();
		cards.forEach(card -> result.put(card.id(), card));
		return result;
	}
}
