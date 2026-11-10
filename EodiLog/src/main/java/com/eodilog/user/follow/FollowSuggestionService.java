package com.eodilog.user.follow;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.user.UserErrorCode;
import com.eodilog.user.dto.UserCard;
import com.eodilog.user.follow.FollowSuggestion.Kind;
import com.eodilog.user.follow.FollowSuggestion.Reason;
import com.eodilog.user.service.UserCardReader;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 친구 추천과 추천 숨김(명세 §3, 결정 F-26~F-30). 점수 모델 없이 두 가지 공개 가능한 이유만 쓴다.
// 후보: 함께 여행한 사람(ACTIVE·LEFT 멤버십, 삭제된 여행 제외), 나를 팔로우(ACCEPTED)하는데 내가 팔로우하지 않은 사람.
// 제외: 본인, 탈퇴·가입 대기 회원, 내가 이미 팔로우했거나 요청 중인 사람, 숨긴 사람.
// 정렬: 함께 여행한 사람 먼저(함께한 여행 수 많은 순), 그다음 나를 팔로우한 사람, 마지막 기준 id
@Service
public class FollowSuggestionService {

	static final int MAX_LIMIT = 50;

	private static final String CANDIDATES = """
			WITH co AS (
			    SELECT o.user_id AS id, count(DISTINCT o.trip_id) AS trips
			    FROM trip_members m
			    JOIN trips t ON t.id=m.trip_id AND t.deleted_at IS NULL
			    JOIN trip_members o ON o.trip_id=m.trip_id AND o.user_id<>m.user_id AND o.status IN ('ACTIVE','LEFT')
			    WHERE m.user_id=:me AND m.status IN ('ACTIVE','LEFT')
			    GROUP BY o.user_id
			), fan AS (
			    SELECT f.follower_user_id AS id FROM follows f
			    WHERE f.followee_user_id=:me AND f.status='ACCEPTED'
			), candidate AS (
			    SELECT u.id,
			           CASE WHEN co.id IS NOT NULL THEN 0 ELSE 1 END AS rank,
			           COALESCE(co.trips,0) AS trips
			    FROM users u
			    LEFT JOIN co ON co.id=u.id
			    LEFT JOIN fan ON fan.id=u.id
			    WHERE (co.id IS NOT NULL OR fan.id IS NOT NULL)
			      AND u.id<>:me AND u.status='ACTIVE' AND u.profile_completed
			      AND NOT EXISTS (SELECT 1 FROM follows mine WHERE mine.follower_user_id=:me AND mine.followee_user_id=u.id)
			      AND NOT EXISTS (SELECT 1 FROM suggestion_dismissals d WHERE d.user_id=:me AND d.candidate_user_id=u.id)
			)
			SELECT id,rank,trips FROM candidate
			""";

	private final NamedParameterJdbcTemplate named;
	private final JdbcTemplate jdbc;
	private final UserCardReader cards;
	private final Clock clock;

	public FollowSuggestionService(NamedParameterJdbcTemplate named, JdbcTemplate jdbc, UserCardReader cards, Clock clock) {
		this.named = named;
		this.jdbc = jdbc;
		this.cards = cards;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public PageResponse<FollowSuggestion> list(UUID me, String cursor, int limit) {
		if (limit < 1 || limit > MAX_LIMIT) throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
		MapSqlParameterSource params = new MapSqlParameterSource("me", me).addValue("limit", limit + 1);
		StringBuilder sql = new StringBuilder(CANDIDATES);
		if (cursor != null) {
			Point point = Point.decode(cursor);
			// (rank ASC, trips DESC, id ASC) 다음부터
			sql.append(" WHERE (rank,-trips,id)>(:rank,:negTrips,:id)");
			params.addValue("rank", point.rank()).addValue("negTrips", -point.trips()).addValue("id", point.id());
		}
		sql.append(" ORDER BY rank,trips DESC,id LIMIT :limit");
		List<Point> rows = named.query(sql.toString(), params,
				(rs, n) -> new Point(rs.getInt("rank"), rs.getLong("trips"), rs.getObject("id", UUID.class)));
		boolean hasNext = rows.size() > limit;
		List<Point> page = rows.subList(0, Math.min(limit, rows.size()));
		Map<UUID, UserCard> found = cards.findCards(me, page.stream().map(Point::id).toList());
		List<FollowSuggestion> result = new ArrayList<>(page.size());
		for (Point row : page) {
			UserCard card = found.get(row.id());
			if (card == null) continue;
			Reason reason = row.rank() == 0 ? new Reason(Kind.CO_TRAVELER, (int) row.trips()) : new Reason(Kind.FOLLOWS_YOU, null);
			result.add(new FollowSuggestion(card, reason));
		}
		return PageResponse.of(result, hasNext ? page.getLast().encode() : null, hasNext);
	}

	// 영구 숨김. 다시 숨겨도 성공이다. 검색·팔로우·기존 관계에는 영향이 없다
	@Transactional
	public void dismiss(UUID me, UUID candidateId) {
		if (me.equals(candidateId))
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
					List.of(new ErrorField("userId", "자기 자신은 추천에서 숨길 수 없습니다.")));
		Integer exists = jdbc.queryForObject(
				"SELECT count(*) FROM users WHERE id=? AND status='ACTIVE' AND profile_completed", Integer.class, candidateId);
		if (exists == null || exists == 0) throw new BusinessException(UserErrorCode.USER_NOT_FOUND);
		jdbc.update("INSERT INTO suggestion_dismissals(user_id,candidate_user_id,created_at) VALUES(?,?,?) ON CONFLICT DO NOTHING",
				me, candidateId, Timestamp.from(clock.instant()));
	}

	// 추천 커서: 정렬 키(이유 순위, 함께한 여행 수, id)
	record Point(int rank, long trips, UUID id) {

		String encode() {
			String raw = rank + "|" + trips + "|" + id;
			return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
		}

		static Point decode(String cursor) {
			try {
				String[] parts = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8).split("\\|", 3);
				int rank = Integer.parseInt(parts[0]);
				long trips = Long.parseLong(parts[1]);
				if ((rank != 0 && rank != 1) || trips < 0) throw new IllegalArgumentException();
				return new Point(rank, trips, UUID.fromString(parts[2]));
			} catch (RuntimeException ex) {
				throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
						List.of(new ErrorField("cursor", "올바르지 않은 커서입니다. 처음부터 다시 조회해 주세요.")));
			}
		}

	}

}
