package com.eodilog.user.service;

import java.util.Collection;
import java.util.Set;
import java.util.UUID;

// 다른 도메인(피드·지도·타임라인)이 회원 콘텐츠 경로를 판정할 때 쓰는 내부 조회. 현재 DB 값으로 판단하며 캐시하지 않는다.
// 계정·관계만 판정한다. 피드 게시 상태, 개인별 숨김, 여행 멤버십은 판단하지 않는다.
// 최소 회원 카드(UserCardReader)를 읽을 수 있다는 것은 콘텐츠 열람 허용을 뜻하지 않는다
public interface FollowAccess {

	// 허용: 본인, ACTIVE·가입 완료·PUBLIC 회원, ACTIVE·가입 완료·PRIVATE 회원 중 viewer→member가 ACCEPTED인 경우.
	// viewer 자신이 ACTIVE·가입 완료가 아니거나 member가 없거나 탈퇴·가입 대기면 거부. REQUESTED는 허용하지 않는다
	boolean canViewMemberContent(UUID viewerId, UUID memberUserId);

	// canViewMemberContent를 한 번의 쿼리로 판정해 허용된 ID만 돌려준다. 빈 입력은 DB를 조회하지 않는다
	Set<UUID> viewableMembers(UUID viewerId, Collection<UUID> memberUserIds);

	// viewer→X가 ACCEPTED이고 X가 ACTIVE·가입 완료인 X. REQUESTED와 반대 방향(나를 팔로우)은 넣지 않는다
	Set<UUID> acceptedFolloweeIds(UUID viewerId);

}
