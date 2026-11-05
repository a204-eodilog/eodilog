import type { Href } from 'expo-router';

import { inviteHref } from '@/features/invitation/invite-rules';

/**
 * 카카오 로그인 뒤 갈 곳(사용자 흐름 1장).
 * - 가입 대기(닉네임 없음): S02 프로필. 저장 뒤 S02가 S03 또는 S04로 보낸다
 * - 카카오 닉네임으로 바로 가입된 첫 가입(isNewUser): S02를 건너뛰어도 첫 가입이라 S03 취향 입력으로,
 *   초대로 왔으면 S04를 거쳐 S03으로(first)
 * - 기존 회원: 홈, 초대로 왔으면 S04
 */
export function afterLoginHref({
  profileCompleted,
  isNewUser,
  inviteToken,
}: {
  profileCompleted: boolean;
  isNewUser: boolean;
  inviteToken: string | null;
}): Href {
  if (!profileCompleted) return '/profile';
  if (isNewUser) return inviteToken ? inviteHref(inviteToken, { first: true }) : '/preferences';
  return inviteToken ? inviteHref(inviteToken) : '/home';
}
