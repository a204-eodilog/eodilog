package com.eodilog.user.service;

import java.util.*;
import com.eodilog.user.dto.UserCard;

public interface UserCardReader {

	// 존재하는 회원만 반환한다. 탈퇴 회원의 닉네임은 마스킹하며 빈 입력은 DB를 조회하지 않는다.
	// followingStatus는 viewer→회원, followedByStatus는 회원→viewer 관계다. 카드를 읽을 수 있다고 콘텐츠를 볼 수 있는 것은 아니다(FollowAccess)
	Map<UUID, UserCard> findCards(UUID viewerId, Collection<UUID> userIds);

}
