import type { ChatRoom } from './types';

/**
 * roomId → tripId 표. 실시간 이벤트에는 roomId만 있어서 캐시 키(['trips', tripId, …])를 찾을 때 쓴다.
 * ChatRoom을 받을 때마다 채운다. 기기에 남기지 않는다
 */
const tripByRoom = new Map<string, string>();

export function rememberRooms(rooms: readonly Pick<ChatRoom, 'id' | 'tripId'>[]) {
  for (const room of rooms) tripByRoom.set(room.id, room.tripId);
}

export function tripIdOf(roomId: string): string | undefined {
  return tripByRoom.get(roomId);
}

/** 그 여행의 방을 표에서 뺀다(차단·나가기) */
export function forgetTripRooms(tripId: string) {
  for (const [roomId, t] of tripByRoom) if (t === tripId) tripByRoom.delete(roomId);
}

export function clearRoomIndex() {
  tripByRoom.clear();
}
