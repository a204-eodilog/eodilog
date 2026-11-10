package com.eodilog.user;

import com.eodilog.global.common.error.BusinessException;
import com.eodilog.global.common.error.CommonErrorCode;
import com.eodilog.user.dto.AccountVisibility;
import com.eodilog.user.follow.FollowService;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// PATCH /me 처리. 회원 행을 배타 잠금해 팔로우 요청(공유 잠금)과 공개 범위 전환의 순서를 맞춘다.
// 한 필드라도 검증에 실패하면 아무것도 저장하지 않는다
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
		// 쓰기 전에 파일부터 검사한다
		if (patch.imageSent() && patch.profileImageAssetId() != null) requireProfileImage(userId, patch.profileImageAssetId());
		if (patch.nickname() != null) members.complete(userId, patch.nickname());
		if (patch.imageSent())
			jdbc.update("UPDATE users SET profile_asset_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", patch.profileImageAssetId(), userId);
		if (patch.ageBandSent())
			jdbc.update("UPDATE users SET age_band=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
					patch.ageBand() == null ? null : patch.ageBand().name(), userId);
		if (patch.ageUseConsent() != null)
			jdbc.update("UPDATE users SET age_use_consent=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", patch.ageUseConsent(), userId);
		AccountVisibility next = patch.accountVisibility();
		if (next != null && next != current.visibility()) {
			jdbc.update("UPDATE users SET account_visibility=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", next.name(), userId);
			if (next == AccountVisibility.PUBLIC) follows.acceptAllPending(userId);
		}
		return members.profile(userId);
	}

	// 본인이 올렸고 업로드 확인(complete)이 끝난 PROFILE 파일만. 공유 잠금으로 확인과 저장 사이 상태 변경을 막는다
	private void requireProfileImage(UUID userId, UUID assetId) {
		Boolean usable = jdbc.query("""
				SELECT true FROM assets WHERE id=? AND owner_user_id=? AND purpose='PROFILE' AND status='READY' FOR SHARE
				""", rs -> rs.next() ? Boolean.TRUE : Boolean.FALSE, assetId, userId);
		if (!Boolean.TRUE.equals(usable)) throw new BusinessException(UserErrorCode.INVALID_PROFILE_IMAGE);
	}

	private record Current(boolean completed, AccountVisibility visibility) {
	}

}
