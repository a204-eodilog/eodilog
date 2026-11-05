import { secureStorage } from '@/lib/secure-storage';
import { formatDay, seoulToday } from '@/lib/seoul-date';

import type { SavedInviteLink } from './types';

/**
 * 이 기기에서 만든 초대 링크를 만료 전까지 남겨 둔다(research R1).
 * 서버는 링크를 만들 때만 url을 알려 주고 다시 조회할 수 없어서, S18에 다시 들어왔을 때 같은 링크를 보여 주려면 기기에 남겨야 한다.
 * 링크를 가진 사람은 누구나 여행에 들어올 수 있으므로 로그인 토큰과 같은 보안 저장소에 둔다.
 */
const KEY = 'eodilog.invites';

type InviteStore = { userId: string; links: Record<string, SavedInviteLink> };

/** 만료 시각부터 서버가 참여를 막는다. 날짜가 아니라 시각으로 비교한다 */
export function isInviteExpired(link: SavedInviteLink, now: Date): boolean {
  return now.getTime() >= Date.parse(link.expiresAt);
}

/** S18 만료 줄. 만료 시각(UTC)을 서울 날짜로 바꿔 "11.12(목)까지 쓸 수 있어요" */
export function inviteExpiryLabel(expiresAt: string): string {
  return `${formatDay(seoulToday(new Date(expiresAt)))}까지 쓸 수 있어요`;
}

async function load(): Promise<InviteStore | null> {
  const raw = await secureStorage.get(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as InviteStore;
    if (typeof parsed?.userId !== 'string' || typeof parsed.links !== 'object' || !parsed.links) {
      return null;
    }
    return parsed;
  } catch {
    // 깨진 값은 없는 것으로 본다
    return null;
  }
}

function save(store: InviteStore) {
  return secureStorage.set(KEY, JSON.stringify(store));
}

/** 이 사용자가 이 여행에 만든, 아직 쓸 수 있는 링크. 다른 사용자거나 만료됐으면 null */
export async function readInviteLink(
  userId: string,
  tripId: string,
  now: Date = new Date(),
): Promise<SavedInviteLink | null> {
  const store = await load();
  if (!store || store.userId !== userId) return null;
  const link = store.links[tripId];
  if (!link || isInviteExpired(link, now)) return null;
  return link;
}

/** 새로 만든 링크를 남긴다. 만료된 다른 링크는 함께 지우고, 사용자가 바뀌었으면 이전 사용자의 링크를 모두 버린다 */
export async function saveInviteLink(
  userId: string,
  tripId: string,
  link: SavedInviteLink,
  now: Date = new Date(),
): Promise<void> {
  const store = await load();
  const links: Record<string, SavedInviteLink> = {};
  if (store && store.userId === userId) {
    for (const [id, saved] of Object.entries(store.links)) {
      if (!isInviteExpired(saved, now)) links[id] = saved;
    }
  }
  links[tripId] = link;
  await save({ userId, links });
}

/** 링크를 취소했거나 그 여행에서 빠졌을 때 */
export async function forgetInviteLink(tripId: string): Promise<void> {
  const store = await load();
  if (!store || !(tripId in store.links)) return;
  const { [tripId]: _removed, ...links } = store.links;
  await save({ userId: store.userId, links });
}

/** 로그아웃하면 모두 지운다(FR-033) */
export async function clearInviteLinks(): Promise<void> {
  await secureStorage.remove(KEY);
}
