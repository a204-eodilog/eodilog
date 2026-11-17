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

/** 앱 안 맞팔 친구 초대(보내는 쪽). 서버가 맞팔 여부와 상태를 정해 준다 */
export type InvitableFriendState = 'INVITABLE' | 'INVITED' | 'MEMBER';

export type InvitableFriend = {
  user: UserCard;
  state: InvitableFriendState;
  /** INVITED일 때만. 취소에 쓴다 */
  invitationId: string | null;
};

/** GET /trips/{tripId}/invitable-friends. INVITABLE → INVITED → MEMBER, 같은 상태 안에서는 닉네임 순 */
export type InvitableFriends = {
  friends: InvitableFriend[];
  activeMemberCount: number;
  capacity: number;
  /** 500명이 넘어 잘렸으면 true */
  truncated: boolean;
};

export type SendResult = 'SENT' | 'ALREADY_INVITED' | 'ALREADY_MEMBER' | 'NOT_MUTUAL';

export type SendFriendInvitationsResponse = {
  results: { userId: string; result: SendResult; invitationId: string | null }[];
};

export type ReceivedTripInvitationStatus =
  'PENDING' | 'EXPIRED' | 'ACCEPTED' | 'DECLINED' | 'CANCELED';

/** 받은 앱 내 초대. 링크 미리보기와 같은 공개 범위(동행 명단·경비 없음) */
export type ReceivedTripInvitation = {
  id: string;
  trip: {
    id: string;
    title: string;
    startDate: string | null;
    endDate: string | null;
    memberCount: number;
  };
  inviter: UserCard;
  status: ReceivedTripInvitationStatus;
  alreadyMember: boolean;
  expiresAt: string;
  createdAt: string;
};
