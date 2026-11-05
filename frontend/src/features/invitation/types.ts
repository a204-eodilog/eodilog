import type { UserCard } from '@/api/types';

/** GET /invitations/{token}. 여행 이름·기간·초대한 사람만 준다. 동행 명단은 참여 전에 보여 주지 않는다 */
export type InvitationPreview = {
  tripTitle: string;
  startDate: string | null;
  endDate: string | null;
  inviter: { nickname: string };
  /** 로그인했을 때만. 초대한 사람과 나의 관계가 들어 있다 */
  inviterUser: UserCard | null;
  expiresAt: string;
  /** 내가 이미 이 여행의 동행이면 true. 링크가 만료·무효여도 200으로 온다 */
  alreadyMember: boolean;
};
