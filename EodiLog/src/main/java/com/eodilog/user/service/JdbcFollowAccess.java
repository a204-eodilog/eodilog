package com.eodilog.user.service;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class JdbcFollowAccess implements FollowAccess {

	private static final String VIEWER_USABLE =
			"EXISTS (SELECT 1 FROM users v WHERE v.id=:viewer AND v.status='ACTIVE' AND v.profile_completed)";

	private final NamedParameterJdbcTemplate jdbc;

	public JdbcFollowAccess(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public boolean canViewMemberContent(UUID viewerId, UUID memberUserId) {
		if (viewerId == null || memberUserId == null) return false;
		return viewableMembers(viewerId, List.of(memberUserId)).contains(memberUserId);
	}

	@Override
	@Transactional(readOnly = true)
	public Set<UUID> viewableMembers(UUID viewerId, Collection<UUID> memberUserIds) {
		if (viewerId == null || memberUserIds == null) return Set.of();
		Set<UUID> ids = new LinkedHashSet<>(memberUserIds);
		ids.removeIf(Objects::isNull);
		if (ids.isEmpty()) return Set.of();
		List<UUID> rows = jdbc.queryForList("""
				SELECT u.id FROM users u
				WHERE u.id IN (:ids) AND u.status='ACTIVE' AND u.profile_completed AND %s
				AND (u.id=:viewer OR u.account_visibility='PUBLIC' OR EXISTS (
				    SELECT 1 FROM follows f WHERE f.follower_user_id=:viewer AND f.followee_user_id=u.id
				    AND f.status='ACCEPTED'))
				""".formatted(VIEWER_USABLE), new MapSqlParameterSource("ids", ids).addValue("viewer", viewerId),
				UUID.class);
		Set<UUID> allowed = new LinkedHashSet<>();
		for (UUID id : ids) if (rows.contains(id)) allowed.add(id);
		return allowed;
	}

	@Override
	@Transactional(readOnly = true)
	public Set<UUID> acceptedFolloweeIds(UUID viewerId) {
		if (viewerId == null) return Set.of();
		return new LinkedHashSet<>(jdbc.queryForList("""
				SELECT f.followee_user_id FROM follows f JOIN users u ON u.id=f.followee_user_id
				WHERE f.follower_user_id=:viewer AND f.status='ACCEPTED' AND u.status='ACTIVE' AND u.profile_completed
				AND %s ORDER BY f.followee_user_id
				""".formatted(VIEWER_USABLE), new MapSqlParameterSource("viewer", viewerId), UUID.class));
	}

}
