package com.eodilog.user.service;

import java.util.*;
import com.eodilog.user.dto.UserCard;

public interface UserCardReader {

	// 존재하는 회원만 반환한다. 탈퇴 회원의 닉네임은 마스킹하며 빈 입력은 DB를 조회하지 않는다.
	Map<UUID, UserCard> findCards(UUID viewerId, Collection<UUID> userIds);

}
