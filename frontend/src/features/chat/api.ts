import { apiClient } from '@/api/client';
import type { DataResponse, PageResponse } from '@/api/types';

import type { ChatRoom, Message, MessagePage, SendMessageBody } from './types';

// 계약: specs/20261105-142623-trip-group-chat/contracts/chat-api.md (백엔드 ChatController 기준)

/** 대화방 목록은 한 사람의 참여 여행 수만큼이라 최대 크기로 받아 쪽 수를 줄인다 */
export const ROOMS_PAGE_LIMIT = 100;
/** 처음 열 때 받는 최근 메시지 수 */
export const FIRST_PAGE_LIMIT = 30;
/** 위로 올려 더 받는 이전 메시지 수 */
export const OLDER_PAGE_LIMIT = 50;
/** 다시 연결·빈칸 채우기 때 한 번에 받는 수. 서버 최대값이다 */
export const CATCH_UP_LIMIT = 100;

/** GET /chat/rooms. 방을 만든 역순이다. 최근 메시지 순 정렬은 앱이 한다 */
export async function getChatRooms(
  cursor: string | null,
  signal?: AbortSignal,
): Promise<PageResponse<ChatRoom>> {
  const { data } = await apiClient.get<PageResponse<ChatRoom>>('/chat/rooms', {
    params: { limit: ROOMS_PAGE_LIMIT, ...(cursor ? { cursor } : {}) },
    // 쿼리가 취소되면(화면을 떠남·로그아웃) 실제 HTTP 요청도 끊는다
    signal,
  });
  return data;
}

/** GET /trips/{tripId}/chat-room. 나갔거나 삭제된 여행이면 404 TRIP_NOT_FOUND */
export async function getTripChatRoom(tripId: string, signal?: AbortSignal): Promise<ChatRoom> {
  const { data } = await apiClient.get<DataResponse<ChatRoom>>(`/trips/${tripId}/chat-room`, {
    signal,
  });
  return data.data;
}

/**
 * GET /chat/rooms/{roomId}/messages. beforeSequence보다 작은 메시지를 sequence 내림차순으로 준다.
 * cursor를 같이 보내면 400이라 보내지 않는다. 응답은 DataResponse로 감싸지 않은 {data, page}다
 */
export async function getMessages(
  roomId: string,
  { beforeSequence, limit }: { beforeSequence?: number; limit: number },
  signal?: AbortSignal,
): Promise<MessagePage> {
  const { data } = await apiClient.get<MessagePage>(`/chat/rooms/${roomId}/messages`, {
    params: { limit, ...(beforeSequence !== undefined ? { beforeSequence } : {}) },
    // 로그아웃(채팅 세션 멈춤)이나 쿼리 취소 때 실제 HTTP 요청도 끊는다
    signal,
  });
  return data;
}

/**
 * POST /chat/rooms/{roomId}/messages. 같은 clientMessageId·같은 본문이면 서버가 처음 메시지를 다시 준다(201).
 * 그래서 다시 보낼 때는 같은 값을 쓴다
 */
export async function sendMessage(
  roomId: string,
  body: SendMessageBody,
  signal?: AbortSignal,
): Promise<Message> {
  const { data } = await apiClient.post<DataResponse<Message>>(
    `/chat/rooms/${roomId}/messages`,
    body,
    { signal },
  );
  return data.data;
}
