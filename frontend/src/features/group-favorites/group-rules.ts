import type { SavedPlace } from './types';

/** 담은 동행을 멤버 목록에서 찾지 못했을 때(나간 동행) */
export const UNKNOWN_MEMBER = '동행';

type Member = { id: string; name: string };

/** 담은 동행 이름들. "세은, 승기" */
export function saverNames(item: SavedPlace, members: readonly Member[]): string[] {
  return item.savedBy.map((s) => members.find((m) => m.id === s.memberId)?.name ?? UNKNOWN_MEMBER);
}

/** 겹친 곳이면 "겹침 2명", 아니면 null */
export function overlapLabel(item: SavedPlace): string | null {
  return item.savedCount >= 2 ? `겹침 ${item.savedCount}명` : null;
}

/** 내가 담은 장소인지 */
export function isMine(item: SavedPlace, myMemberId: string | null): boolean {
  return myMemberId !== null && item.savedBy.some((s) => s.memberId === myMemberId);
}

/** 내 메모. 안 담았거나 메모가 없으면 빈 글자 */
export function myMemo(item: SavedPlace, myMemberId: string | null): string {
  return item.savedBy.find((s) => s.memberId === myMemberId)?.memo ?? '';
}

/** 주소를 짧게. "부산 해운대구 우동" → "부산 해운대구". 없으면 null */
export function shortAddress(address: string | null): string | null {
  if (!address) return null;
  const parts = address.trim().split(/\s+/);
  return parts.slice(0, 2).join(' ') || null;
}

/** 메모 최대 길이(서버 2000자) */
export const MEMO_MAX = 2000;
