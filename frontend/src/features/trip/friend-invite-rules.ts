import type { InvitableFriend, SendResult } from '@/features/invitation/types';

/** 지금 더 고를 수 있는 인원. 정원에서 ACTIVE 멤버를 뺀다 */
export function remainingSeats(capacity: number, activeMemberCount: number): number {
  return Math.max(0, capacity - activeMemberCount);
}

/** 고를 수 있는 줄인지. 이미 초대했거나 동행인 친구는 고를 수 없다 */
export function isPickable(friend: InvitableFriend): boolean {
  return friend.state === 'INVITABLE';
}

/** 친구 줄을 눌렀을 때 고른 목록. 이미 고른 사람이면 빼고, 남은 자리가 없으면 그대로 둔다 */
export function togglePick(picked: readonly string[], userId: string, seats: number): string[] {
  if (picked.includes(userId)) return picked.filter((id) => id !== userId);
  if (picked.length >= seats) return [...picked];
  return [...picked, userId];
}

/** 닉네임 일부로 거른다. 앞뒤 공백은 무시하고 대소문자를 가리지 않는다 */
export function filterFriends(
  friends: readonly InvitableFriend[],
  query: string,
): InvitableFriend[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...friends];
  return friends.filter((f) => f.user.nickname.toLowerCase().includes(q));
}

/** 보내기 결과를 한 문장으로. 보낸 사람이 없으면 이유만 잇는다 */
export function sendResultMessage(results: readonly { result: SendResult }[]): string {
  const count = (r: SendResult) => results.filter((x) => x.result === r).length;
  const sent = count('SENT');
  const already = count('ALREADY_INVITED');
  const member = count('ALREADY_MEMBER');
  const notMutual = count('NOT_MUTUAL');
  const parts: string[] = [];
  if (sent > 0) {
    parts.push(
      already + member + notMutual === 0
        ? `${sent}명에게 초대를 보냈어요`
        : `${sent}명에게 보냈어요`,
    );
  }
  if (already > 0) parts.push(`${already}명은 이미 초대했어요`);
  if (member > 0) parts.push(`${member}명은 이미 함께하고 있어요`);
  if (notMutual > 0) parts.push(`${notMutual}명은 서로 팔로우가 아니라 초대하지 못했어요`);
  return parts.join('. ');
}
