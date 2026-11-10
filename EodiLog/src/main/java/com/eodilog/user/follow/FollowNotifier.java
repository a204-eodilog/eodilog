package com.eodilog.user.follow;

import com.eodilog.notification.NotificationEventRegistrar;
import com.eodilog.notification.NotificationEventRegistrar.EventCommand;
import com.eodilog.user.dto.UserCard;
import com.eodilog.user.service.UserCardReader;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// 팔로우 요청·수락 알림(명세 §9 FOLLOW_REQUESTED/ACCEPTED). 받는 사람의 팔로우 요청 알림 설정이 꺼져 있으면 만들지 않는다.
// 공개 계정 즉시 팔로우와 공개 전환 일괄 수락은 알리지 않는다. 여행 채팅에는 넣지 않으므로 tripId는 없다.
// 취소 뒤 다시 요청하면 관계 ID가 새로 생겨 다시 알린다
@Component
public class FollowNotifier {

	static final String TARGET_TYPE = "USER";
	static final String FALLBACK_NICKNAME = "사용자";

	private final NotificationEventRegistrar registrar;
	private final UserCardReader userCardReader;
	private final JdbcTemplate jdbc;

	public FollowNotifier(NotificationEventRegistrar registrar, UserCardReader userCardReader, JdbcTemplate jdbc) {
		this.registrar = registrar;
		this.userCardReader = userCardReader;
		this.jdbc = jdbc;
	}

	// 비공개 계정에 요청을 새로 만든 뒤 부른다. 대상은 요청한 사람 프로필이다
	@Transactional(propagation = Propagation.MANDATORY)
	public void requested(UUID followId, UUID followerId, UUID followeeId) {
		if (!enabled(followeeId)) return;
		registrar.register(new EventCommand("FOLLOW_REQUESTED", null, followerId, TARGET_TYPE, followerId,
				nickname(followerId) + "님이 팔로우를 요청했어요.", "FOLLOW_REQUESTED:" + followId), List.of(followeeId));
	}

	// 받은 요청을 수락한 뒤 부른다. 대상은 수락한 사람 프로필이다
	@Transactional(propagation = Propagation.MANDATORY)
	public void accepted(UUID followId, UUID followerId, UUID followeeId) {
		if (!enabled(followerId)) return;
		registrar.register(new EventCommand("FOLLOW_ACCEPTED", null, followeeId, TARGET_TYPE, followeeId,
				nickname(followeeId) + "님이 팔로우 요청을 수락했어요.", "FOLLOW_ACCEPTED:" + followId), List.of(followerId));
	}

	// 설정 행이 아직 없으면 기본값(켜짐)이다
	private boolean enabled(UUID recipientId) {
		List<Boolean> rows = jdbc.queryForList(
				"SELECT follow_requests_enabled FROM user_settings WHERE user_id=?", Boolean.class, recipientId);
		return rows.isEmpty() || Boolean.TRUE.equals(rows.getFirst());
	}

	private String nickname(UUID userId) {
		UserCard card = userCardReader.findCards(userId, List.of(userId)).get(userId);
		return card == null || card.nickname() == null || card.nickname().isBlank()
				? FALLBACK_NICKNAME : card.nickname();
	}

}
