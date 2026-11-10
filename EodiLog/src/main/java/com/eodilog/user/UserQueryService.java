package com.eodilog.user;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.global.common.error.ErrorResponse.ErrorField;
import com.eodilog.global.common.response.PageResponse;
import com.eodilog.user.dto.UserCard;
import com.eodilog.user.service.UserCardReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 회원 검색과 다른 사용자 프로필(명세 §3). 검색은 닉네임만, 활동 중·가입 완료 회원만, 본인 제외.
// PRIVATE 계정도 최소 카드는 노출한다. 카드 노출은 콘텐츠 열람 허용이 아니다(FollowAccess)
@Service
public class UserQueryService {

	static final int MAX_QUERY_LENGTH = 50;
	static final int MAX_LIMIT = 50;
	private static final String USABLE = "u.status='ACTIVE' AND u.profile_completed";
	// 완전 일치(0)를 먼저, 그다음 닉네임·id 순
	private static final String RANK = "(CASE WHEN lower(u.nickname)=lower(:exact) THEN 0 ELSE 1 END)";

	private final NamedParameterJdbcTemplate jdbc;
	private final UserCardReader cards;

	public UserQueryService(NamedParameterJdbcTemplate jdbc, UserCardReader cards) {
		this.jdbc = jdbc;
		this.cards = cards;
	}

	@Transactional(readOnly = true)
	public PageResponse<UserCard> search(UUID me, String query, String cursor, int limit) {
		String clean = query == null ? "" : query.strip();
		if (clean.isEmpty() || clean.indexOf('\0') >= 0 || clean.codePointCount(0, clean.length()) > MAX_QUERY_LENGTH)
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
					List.of(new ErrorField("query", "검색어는 공백을 뺀 1~50자로 입력해 주세요.")));
		if (limit < 1 || limit > MAX_LIMIT) throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
		// 대소문자는 DB의 lower()로 맞춘다. 이스케이프 문자는 lower()의 영향을 받지 않는다
		MapSqlParameterSource params = new MapSqlParameterSource("me", me).addValue("exact", clean)
				.addValue("pattern", "%" + escapeLike(clean) + "%").addValue("limit", limit + 1);
		StringBuilder sql = new StringBuilder("SELECT u.id,u.nickname,").append(RANK).append(" AS rank FROM users u WHERE ")
				.append(USABLE).append(" AND u.id<>:me AND lower(u.nickname) LIKE lower(:pattern) ESCAPE '\\'");
		if (cursor != null) {
			SearchCursor point = SearchCursor.decode(cursor);
			sql.append(" AND (").append(RANK).append(",u.nickname,u.id)>(:rank,:nickname,:id)");
			params.addValue("rank", point.rank()).addValue("nickname", point.nickname()).addValue("id", point.id());
		}
		sql.append(" ORDER BY rank,u.nickname,u.id LIMIT :limit");
		List<SearchCursor> rows = jdbc.query(sql.toString(), params,
				(rs, n) -> new SearchCursor(rs.getInt("rank"), rs.getString("nickname"), rs.getObject("id", UUID.class)));
		boolean hasNext = rows.size() > limit;
		List<SearchCursor> page = rows.subList(0, Math.min(limit, rows.size()));
		Map<UUID, UserCard> found = cards.findCards(me, page.stream().map(SearchCursor::id).toList());
		List<UserCard> result = new ArrayList<>(page.size());
		for (SearchCursor row : page) if (found.containsKey(row.id())) result.add(found.get(row.id()));
		return PageResponse.of(result, hasNext ? page.getLast().encode() : null, hasNext);
	}

	// 본인도 조회할 수 있다. 수는 상대가 활동 중·가입 완료인 ACCEPTED 관계만 센다
	@Transactional(readOnly = true)
	public PublicProfile profile(UUID me, UUID userId) {
		List<long[]> counts = jdbc.query("""
				SELECT
				  (SELECT count(*) FROM follows f JOIN users o ON o.id=f.follower_user_id
				   WHERE f.followee_user_id=u.id AND f.status='ACCEPTED' AND o.status='ACTIVE' AND o.profile_completed) AS followers,
				  (SELECT count(*) FROM follows f JOIN users o ON o.id=f.followee_user_id
				   WHERE f.follower_user_id=u.id AND f.status='ACCEPTED' AND o.status='ACTIVE' AND o.profile_completed) AS following
				FROM users u WHERE u.id=:id AND %s
				""".formatted(USABLE), new MapSqlParameterSource("id", userId),
				(rs, n) -> new long[] {rs.getLong("followers"), rs.getLong("following")});
		if (counts.isEmpty()) throw new BusinessException(UserErrorCode.USER_NOT_FOUND);
		UserCard card = cards.findCards(me, List.of(userId)).get(userId);
		if (card == null) throw new BusinessException(UserErrorCode.USER_NOT_FOUND);
		return PublicProfile.of(card, counts.getFirst()[0], counts.getFirst()[1]);
	}

	static String escapeLike(String value) {
		return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
	}

	// 검색 커서: 정렬 키(완전 일치 여부, 닉네임, id). 닉네임에 구분자가 있어도 되도록 마지막에 둔다
	record SearchCursor(int rank, String nickname, UUID id) {

		String encode() {
			String raw = rank + "|" + id + "|" + nickname;
			return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
		}

		static SearchCursor decode(String cursor) {
			try {
				String raw = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
				String[] parts = raw.split("\\|", 3);
				int rank = Integer.parseInt(parts[0]);
				if (rank != 0 && rank != 1) throw new IllegalArgumentException();
				return new SearchCursor(rank, parts[2], UUID.fromString(parts[1]));
			} catch (RuntimeException ex) {
				throw new BusinessException(CommonErrorCode.VALIDATION_ERROR, CommonErrorCode.VALIDATION_ERROR.message(),
						List.of(new ErrorField("cursor", "올바르지 않은 커서입니다. 처음부터 다시 조회해 주세요.")));
			}
		}

	}

}
