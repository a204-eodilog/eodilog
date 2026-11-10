package com.eodilog.user;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.user.dto.AccountVisibility;
import com.eodilog.user.follow.FollowService;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// PATCH /me 처리. 회원 행을 배타 잠금해 팔로우 요청(공유 잠금)과 공개 범위 전환의 순서를 맞춘다
@Service
public class ProfileService {

	private final JdbcTemplate jdbc;
	private final MemberStore members;
	private final FollowService follows;

	public ProfileService(JdbcTemplate jdbc, MemberStore members, FollowService follows) {
		this.jdbc = jdbc;
		this.members = members;
		this.follows = follows;
	}

	@Transactional
	public MemberStore.MyProfile update(UUID userId, ProfilePatch patch) {
		if (patch == null || patch.hasExplicitNull() || patch.isEmpty())
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
		var rows = jdbc.query("SELECT profile_completed,account_visibility FROM users WHERE id=? AND status='ACTIVE' FOR UPDATE",
				(rs, n) -> new Current(rs.getBoolean(1), AccountVisibility.valueOf(rs.getString(2))), userId);
		if (rows.isEmpty()) throw new BusinessException(CommonErrorCode.UNAUTHENTICATED);
		Current current = rows.getFirst();
		// 가입 대기 사용자는 닉네임으로 가입을 마쳐야 다른 항목도 바꿀 수 있다
		if (!current.completed() && patch.nickname() == null)
			throw new BusinessException(CommonErrorCode.VALIDATION_ERROR);
		if (patch.nickname() != null) members.complete(userId, patch.nickname());
		AccountVisibility next = patch.accountVisibility();
		if (next != null && next != current.visibility()) {
			jdbc.update("UPDATE users SET account_visibility=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", next.name(), userId);
			if (next == AccountVisibility.PUBLIC) follows.acceptAllPending(userId);
		}
		return members.profile(userId);
	}

	private record Current(boolean completed, AccountVisibility visibility) {
	}

}
