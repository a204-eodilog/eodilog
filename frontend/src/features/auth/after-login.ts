import type { Href } from 'expo-router';

import { inviteHref } from '@/features/invitation/invite-rules';

/**
 * 카카오 로그인 뒤 갈 곳(사용자 흐름 1장).
 * - 첫 가입(isNewUser)이나 가입 대기(닉네임 없음): S02 프로필. 서버가 카카오 닉네임으로 바로 가입을 끝내도
 *   닉네임 확인과 연령대 입력을 위해 S02를 거친다. 저장 뒤 S02가 S03 또는 S04(초대로 왔을 때)로 보낸다
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
  if (!profileCompleted || isNewUser) return '/profile';
  return inviteToken ? inviteHref(inviteToken) : '/home';
}
