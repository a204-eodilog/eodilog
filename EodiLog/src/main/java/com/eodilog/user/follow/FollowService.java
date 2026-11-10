package com.eodilog.user.follow;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.response.CreatedAtCursor;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.global.id.UuidV7;
import com.eodilog.user.dto.AccountVisibility;
import com.eodilog.user.dto.FollowStatus;
import com.eodilog.user.dto.UserCard;
import com.eodilog.user.service.UserCardReader;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// 방향별 팔로우 관계(명세 §3). 반대 방향 관계를 만들거나 지우지 않고 공동 여행에도 영향을 주지 않는다.
// 상대가 탈퇴했거나 가입 대기 중이면 관계 행은 남기되 목록·수락에서 제외한다
@Service
public class FollowService {

	static final int MAX_LIMIT = 100;

	// 목록 종류. 내 쪽 열, 상대 쪽 열, 상태, 정렬 시각 열
	public enum ListKind {
		FOLLOWING("follower_user_id", "followee_user_id", FollowStatus.ACCEPTED, "accepted_at"),
		FOLLOWERS("followee_user_id", "follower_user_id", FollowStatus.ACCEPTED, "accepted_at"),
		RECEIVED("followee_user_id", "follower_user_id", FollowStatus.REQUESTED, "requested_at"),
		SENT("follower_user_id", "followee_user_id", FollowStatus.REQUESTED, "requested_at");

		final String mine;
		final String other;
		final FollowStatus status;
		final String sortColumn;

		ListKind(String mine, String other, FollowStatus status, String sortColumn) {
			this.mine = mine;
			this.other = other;
			this.status = status;
			this.sortColumn = sortColumn;
		}
	}

	private static final String COLUMNS = "f.id,f.follower_user_id,f.followee_user_id,f.status,f.requested_at,f.accepted_at";
	// 상대가 활동 중인 가입 완료 회원인지
	private static final String USABLE_USER = "u.status='ACTIVE' AND u.profile_completed";

	private final JdbcTemplate jdbc;
	private final NamedParameterJdbcTemplate named;
	private final UserCardReader userCardReader;
	private final FollowNotifier notifier;
	private final Clock clock;

	public FollowService(JdbcTemplate jdbc, NamedParameterJdbcTemplate named, UserCardReader userCardReader,
			FollowNotifier notifier, Clock clock) {
		this.jdbc = jdbc;
		this.named = named;
		this.userCardReader = userCardReader;
		this.notifier = notifier;
		this.clock = clock;
	}

	// 대상 회원 행을 공유 잠금해 공개 범위 전환과 순서를 맞춘다. 같은 방향이 이미 있으면 그대로 돌려준다(방향별 멱등)
	@Transactional
	public FollowResponse follow(UUID me, UUID targetId) {
		if (me.equals(targetId)) throw new BusinessException(FollowErrorCode.CANNOT_FOLLOW_SELF);
		List<String> visibility = jdbc.queryForList(
				"SELECT account_visibility FROM users u WHERE u.id=? AND " + USABLE_USER + " FOR SHARE",
				String.class, targetId);
		if (visibility.isEmpty()) throw new BusinessException(FollowErrorCode.USER_NOT_FOUND);
		Optional<FollowRow> existing = findPair(me, targetId);
		if (existing.isPresent()) return toResponse(me, existing.get());
		boolean open = AccountVisibility.valueOf(visibility.getFirst()) == AccountVisibility.PUBLIC;
		Timestamp now = Timestamp.from(clock.instant());
		UUID id = UuidV7.generate();
		List<UUID> inserted = jdbc.query("""
				INSERT INTO follows(id,follower_user_id,followee_user_id,status,requested_at,accepted_at)
				VALUES(?,?,?,?,?,?) ON CONFLICT ON CONSTRAINT follows_pair_unique DO NOTHING RETURNING id
				""", (rs, n) -> rs.getObject(1, UUID.class), id, me, targetId,
				(open ? FollowStatus.ACCEPTED : FollowStatus.REQUESTED).name(), now, open ? now : null);
		// 같은 방향을 동시에 요청했으면 먼저 저장된 관계를 돌려준다
		FollowRow row = findPair(me, targetId).orElseThrow();
		if (!inserted.isEmpty() && row.status() == FollowStatus.REQUESTED)
			notifier.requested(row.id(), me, targetId);
		return toResponse(me, row);
	}

	// 받은 요청만 수락한다. 이미 수락한 요청은 그대로 돌려준다. 반대 방향은 만들지 않는다
	@Transactional
	public FollowResponse accept(UUID me, UUID requestId) {
		List<FollowRow> updated = jdbc.query("""
				UPDATE follows f SET status='ACCEPTED',accepted_at=?
				FROM users u WHERE f.id=? AND f.followee_user_id=? AND f.status='REQUESTED'
				AND u.id=f.follower_user_id AND %s
				RETURNING %s
				""".formatted(USABLE_USER, COLUMNS), this::map, Timestamp.from(clock.instant()), requestId, me);
		if (!updated.isEmpty()) {
			FollowRow row = updated.getFirst();
			notifier.accepted(row.id(), row.followerId(), me);
			return toResponse(me, row);
		}
		List<FollowRow> accepted = jdbc.query("SELECT " + COLUMNS + """
				 FROM follows f JOIN users u ON u.id=f.follower_user_id
				WHERE f.id=? AND f.followee_user_id=? AND f.status='ACCEPTED' AND\s""" + USABLE_USER,
				this::map, requestId, me);
		if (accepted.isEmpty()) throw new BusinessException(FollowErrorCode.FOLLOW_REQUEST_NOT_FOUND);
		return toResponse(me, accepted.getFirst());
	}

	// 보낸 사람은 취소, 받은 사람은 거절이다. 수락된 관계는 언팔로우·팔로워 제거로만 지운다
	@Transactional
	public void deleteRequest(UUID me, UUID requestId) {
		int deleted = jdbc.update("""
				DELETE FROM follows WHERE id=? AND status='REQUESTED' AND (follower_user_id=? OR followee_user_id=?)
				""", requestId, me, me);
		if (deleted == 0) throw new BusinessException(FollowErrorCode.FOLLOW_REQUEST_NOT_FOUND);
	}

	// 내가 보낸 방향을 지운다. 대기 중인 요청도 함께 취소된다. 없어도 성공이다
	@Transactional
	public void unfollow(UUID me, UUID targetId) {
		jdbc.update("DELETE FROM follows WHERE follower_user_id=? AND followee_user_id=?", me, targetId);
	}

	// 나를 팔로우한 수락 관계를 지운다. 반대 방향은 유지한다. 없어도 성공이다
	@Transactional
	public void removeFollower(UUID me, UUID followerId) {
		jdbc.update("DELETE FROM follows WHERE follower_user_id=? AND followee_user_id=? AND status='ACCEPTED'",
				followerId, me);
	}

	// 계정을 공개로 바꾼 같은 트랜잭션에서 부른다. 대기 요청을 모두 수락하며 알리지 않는다
	@Transactional(propagation = Propagation.MANDATORY)
	public int acceptAllPending(UUID followeeId) {
		return jdbc.update("UPDATE follows SET status='ACCEPTED',accepted_at=? WHERE followee_user_id=? AND status='REQUESTED'",
				Timestamp.from(clock.instant()), followeeId);
	}

	// 정렬은 (수락 또는 요청 시각 DESC, id DESC)
	@Transactional(readOnly = true)
	public PageResponse<FollowResponse> list(UUID me, ListKind kind, String cursor, int limit) {
		if (limit < 1 || limit > MAX_LIMIT) throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
		CreatedAtCursor point = cursor == null ? null : CreatedAtCursor.decode(cursor);
		String sort = "f." + kind.sortColumn;
		StringBuilder sql = new StringBuilder("SELECT ").append(COLUMNS)
				.append(" FROM follows f JOIN users u ON u.id=f.").append(kind.other)
				.append(" WHERE f.").append(kind.mine).append("=:me AND f.status=:status AND ").append(USABLE_USER);
		MapSqlParameterSource params = new MapSqlParameterSource("me", me)
				.addValue("status", kind.status.name()).addValue("limit", limit + 1);
		if (point != null) {
			sql.append(" AND (").append(sort).append("<:at OR (").append(sort).append("=:at AND f.id<:cursorId))");
			params.addValue("at", Timestamp.from(point.createdAt())).addValue("cursorId", point.id());
		}
		sql.append(" ORDER BY ").append(sort).append(" DESC,f.id DESC LIMIT :limit");
		List<FollowRow> rows = named.query(sql.toString(), params, this::map);
		boolean hasNext = rows.size() > limit;
		List<FollowRow> page = rows.subList(0, Math.min(limit, rows.size()));
		String next = null;
		if (hasNext) {
			FollowRow last = page.getLast();
			Instant at = kind.status == FollowStatus.ACCEPTED ? last.acceptedAt() : last.requestedAt();
			next = new CreatedAtCursor(at, last.id()).encode();
		}
		return PageResponse.of(toResponses(me, page), next, hasNext);
	}

	private Optional<FollowRow> findPair(UUID followerId, UUID followeeId) {
		return jdbc.query("SELECT " + COLUMNS + " FROM follows f WHERE f.follower_user_id=? AND f.followee_user_id=?",
				this::map, followerId, followeeId).stream().findFirst();
	}

	private FollowResponse toResponse(UUID me, FollowRow row) {
		return toResponses(me, List.of(row)).getFirst();
	}

	// 회원 카드를 한 번에 읽는다. 상대 기준 관계 상태는 보는 사람(me) 기준으로 채운다
	private List<FollowResponse> toResponses(UUID me, List<FollowRow> rows) {
		if (rows.isEmpty()) return List.of();
		Set<UUID> ids = new LinkedHashSet<>();
		rows.forEach(row -> {
			ids.add(row.followerId());
			ids.add(row.followeeId());
		});
		Map<UUID, UserCard> cards = userCardReader.findCards(me, ids);
		List<FollowResponse> result = new ArrayList<>(rows.size());
		for (FollowRow row : rows) {
			result.add(new FollowResponse(row.id(), cards.get(row.followerId()), cards.get(row.followeeId()),
					row.status(), row.requestedAt(), row.acceptedAt()));
		}
		return result;
	}

	private FollowRow map(ResultSet rs, int n) throws SQLException {
		Timestamp accepted = rs.getTimestamp("accepted_at");
		return new FollowRow(rs.getObject("id", UUID.class), rs.getObject("follower_user_id", UUID.class),
				rs.getObject("followee_user_id", UUID.class), FollowStatus.valueOf(rs.getString("status")),
				rs.getTimestamp("requested_at").toInstant(), accepted == null ? null : accepted.toInstant());
	}

	record FollowRow(UUID id, UUID followerId, UUID followeeId, FollowStatus status, Instant requestedAt,
			Instant acceptedAt) {
	}

}
