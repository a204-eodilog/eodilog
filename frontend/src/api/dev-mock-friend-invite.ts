import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

import type { UserCard } from './types';

type Trip = {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  members: { user: { id: string } }[];
};

type Helpers = {
  ok: <T>(config: InternalAxiosRequestConfig, data: T, status?: number) => AxiosResponse<T>;
  fail: (
    config: InternalAxiosRequestConfig,
    status: number,
    code: string,
    message: string,
  ) => AxiosError;
  getTrips: () => Trip[];
  /** 받은 초대를 수락하면 새 여행을 목록에 넣고 돌려준다 */
  joinTrip: (title: string) => Trip;
  /** 맞팔 친구 */
  friends: UserCard[];
  meId: string;
};

type Sent = { id: string; tripId: string; userId: string };

const DAY = 24 * 60 * 60 * 1000;
const CAPACITY = 20;

/** 받은 초대 알림(dev-mock-notification)의 대상 번호와 같다 */
export const MOCK_RECEIVED_INVITATION_ID = 'friend-invite-1';

/**
 * 앱 내 맞팔 친구 초대 가짜 서버(docs/plan/in-app-trip-invite-*.md).
 * 보내는 쪽: 맞팔 친구 목록·보내기·취소. 받는 쪽: 하늘님이 보낸 "제주 3박 4일" 초대 하나
 */
export function createFriendInviteMock({ ok, fail, getTrips, joinTrip, friends, meId }: Helpers) {
  const sent: Sent[] = [];
  let seq = 0;
  const inviter = friends[0];
  const received = {
    id: MOCK_RECEIVED_INVITATION_ID,
    trip: {
      id: 'trip-invited',
      title: '제주 3박 4일',
      startDate: new Date(Date.now() + 10 * DAY).toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 13 * DAY).toISOString().slice(0, 10),
      memberCount: 3,
    },
    inviter,
    status: 'PENDING' as string,
    alreadyMember: false,
    expiresAt: new Date(Date.now() + 6 * DAY).toISOString(),
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  };
  let joinedTripId: string | null = null;

  function handle(
    config: InternalAxiosRequestConfig,
    method: string,
    url: string,
  ): AxiosResponse | null {
    const tripMatch =
      /^\/trips\/([^/]+)\/(invitable-friends|friend-invitations)(?:\/([^/]+))?$/.exec(url);
    if (tripMatch) {
      const [, tripId, kind, invitationId] = tripMatch;
      const trip = getTrips().find((t) => t.id === tripId);
      if (!trip || !trip.members.some((m) => m.user.id === meId)) {
        throw fail(config, 404, 'TRIP_NOT_FOUND', '여행을 찾을 수 없습니다.');
      }
      const memberIds = new Set(trip.members.map((m) => m.user.id));
      if (method === 'get' && kind === 'invitable-friends') {
        const rows = friends.map((user) => {
          const pending = sent.find((s) => s.tripId === tripId && s.userId === user.id);
          const state: 'INVITABLE' | 'INVITED' | 'MEMBER' = memberIds.has(user.id)
            ? 'MEMBER'
            : pending
              ? 'INVITED'
              : 'INVITABLE';
          return {
            user: { ...user, followingStatus: 'ACCEPTED', followedByStatus: 'ACCEPTED' },
            state,
            invitationId: pending?.id ?? null,
          };
        });
        const order = { INVITABLE: 0, INVITED: 1, MEMBER: 2 } as const;
        rows.sort(
          (a, b) =>
            order[a.state] - order[b.state] || a.user.nickname.localeCompare(b.user.nickname),
        );
        return ok(config, {
          data: {
            friends: rows,
            activeMemberCount: trip.members.length,
            capacity: CAPACITY,
            truncated: false,
          },
        });
      }
      if (method === 'post' && kind === 'friend-invitations' && !invitationId) {
        const body = JSON.parse(String(config.data ?? '{}')) as { inviteeUserIds?: string[] };
        if (trip.members.length >= CAPACITY)
          throw fail(config, 409, 'TRIP_FULL', '여행 인원이 가득 찼습니다.');
        const results = (body.inviteeUserIds ?? []).map((userId) => {
          if (!friends.some((f) => f.id === userId))
            return { userId, result: 'NOT_MUTUAL', invitationId: null };
          if (memberIds.has(userId))
            return { userId, result: 'ALREADY_MEMBER', invitationId: null };
          const pending = sent.find((s) => s.tripId === tripId && s.userId === userId);
          if (pending) return { userId, result: 'ALREADY_INVITED', invitationId: pending.id };
          seq += 1;
          const next = { id: `friend-sent-${seq}`, tripId, userId };
          sent.push(next);
          return { userId, result: 'SENT', invitationId: next.id };
        });
        return ok(config, { data: { results } });
      }
      if (method === 'delete' && kind === 'friend-invitations' && invitationId) {
        const index = sent.findIndex((s) => s.id === invitationId && s.tripId === tripId);
        if (index >= 0) sent.splice(index, 1);
        return ok(config, '', 204);
      }
      return null;
    }

    if (method === 'get' && url === '/me/trip-invitations') {
      return ok(config, { data: received.status === 'PENDING' ? [received] : [] });
    }
    const meMatch = /^\/me\/trip-invitations\/([^/]+)(\/accept|\/decline)?$/.exec(url);
    if (!meMatch) return null;
    const [, id, action] = meMatch;
    if (id !== received.id) {
      throw fail(config, 404, 'FRIEND_INVITATION_NOT_FOUND', '초대를 찾을 수 없습니다.');
    }
    if (method === 'get' && !action) return ok(config, { data: received });
    if (method === 'post' && action === '/accept') {
      if (received.status === 'DECLINED') {
        throw fail(config, 410, 'INVITATION_REVOKED', '더 이상 쓸 수 없는 초대 링크입니다.');
      }
      if (!joinedTripId) joinedTripId = joinTrip(received.trip.title).id;
      received.status = 'ACCEPTED';
      received.alreadyMember = true;
      const trip = getTrips().find((t) => t.id === joinedTripId);
      return ok(config, { data: trip });
    }
    if (method === 'post' && action === '/decline') {
      if (received.status === 'PENDING') received.status = 'DECLINED';
      return ok(config, '', 204);
    }
    return null;
  }

  return { handle };
}
