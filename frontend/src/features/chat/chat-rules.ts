import { API_ERROR, toApiError } from '@/api/errors';
import type { UserCard } from '@/api/types';
import { formatDay } from '@/lib/seoul-date';

import type { ChatRoom, Message } from './types';

/** 메시지 최대 길이(코드 포인트). 서버 ChatService.TEXT_MAX_LENGTH와 같다 */
export const MESSAGE_MAX_LENGTH = 1000;

/**
 * 보내기 전 확인. 앞뒤 공백을 지우고 비면 empty, 코드 포인트 수가 1000을 넘으면 tooLong.
 * 서버도 코드 포인트로 세므로 이모지 하나는 1이다
 */
export function validateMessageText(text: string): 'ok' | 'empty' | 'tooLong' {
  const cleaned = cleanMessageText(text);
  if (cleaned === '') return 'empty';
  if (Array.from(cleaned).length > MESSAGE_MAX_LENGTH) return 'tooLong';
  return 'ok';
}

/**
 * 보낼 본문. 앞뒤 공백과 줄바꿈을 지운다. 글 중간의 줄바꿈은 일부러 넣은 것이라 그대로 둔다.
 * 서버는 NUL 문자가 든 본문을 400으로 거절하므로 입력에 섞여 들어온 것도 지운다
 */
export function cleanMessageText(text: string): string {
  return text.replace(/\0/g, '').trim();
}

/**
 * 보내기 실패 분류(contracts/chat-api.md §4).
 * retry: 연결·서버 문제라 같은 clientMessageId로 다시 보낼 수 있다
 * blocked: 나갔거나 내보내졌거나 여행이 삭제됐다
 * rejected: 본문이 거절됐다. 다시 보내도 같은 결과라 [다시 보내기]를 두지 않는다
 */
export function sendFailure(error: unknown): 'retry' | 'blocked' | 'rejected' {
  if (isBlocked(error)) return 'blocked';
  const e = toApiError(error);
  if (e.kind !== 'http' || e.status === null) return 'retry';
  if (e.status >= 500 || e.status === 429 || e.status === 401) return 'retry';
  return 'rejected';
}

/** 볼 수 없는 대화방이라는 응답. 대화방 경로는 CHAT_ROOM_NOT_FOUND, 여행 경로는 TRIP_NOT_FOUND */
export function isBlocked(error: unknown): boolean {
  const e = toApiError(error);
  return (
    e.status === 404 &&
    (e.code === API_ERROR.CHAT_ROOM_NOT_FOUND || e.code === API_ERROR.TRIP_NOT_FOUND)
  );
}

/** 서울은 UTC+9 고정이다(서머타임 없음). 시각 표시는 모두 서울 기준이다 */
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

/** UTC 시각 → 서울 기준 { date: 'YYYY-MM-DD', hh, mm } */
function seoulParts(iso: string) {
  const shifted = new Date(new Date(iso).getTime() + SEOUL_OFFSET_MS).toISOString();
  return { date: shifted.slice(0, 10), hh: shifted.slice(11, 13), mm: shifted.slice(14, 16) };
}

/** 최근 메시지 시각 순, 메시지 없는 방은 그 아래에 서버 순서(방을 만든 역순) 그대로 */
export function sortRooms(rooms: readonly ChatRoom[]): ChatRoom[] {
  const withMessage = rooms.filter((r) => r.lastMessage);
  const empty = rooms.filter((r) => !r.lastMessage);
  withMessage.sort((a, b) => {
    const diff = Date.parse(b.lastMessage!.createdAt) - Date.parse(a.lastMessage!.createdAt);
    return diff !== 0 ? diff : b.lastMessage!.sequence - a.lastMessage!.sequence;
  });
  return [...withMessage, ...empty];
}

/** 지금 동행이 아닌 보낸 사람(나갔거나 내보내졌거나 탈퇴) */
export const LEFT_MEMBER = '나간 동행';

/** 보낸 사람 이름. 지금 동행이 아니면 "나간 동행" */
export function senderLabel(message: Message, participants: readonly UserCard[]): string | null {
  if (message.type === 'SYSTEM' || !message.senderId) return null;
  return participants.find((p) => p.id === message.senderId)?.nickname ?? LEFT_MEMBER;
}

export type SystemCardKind = 'poll' | 'course' | 'other';

export type SystemCard = {
  kind: SystemCardKind;
  title: string;
  /** 본문 둘째 줄부터. 없으면 null */
  body: string | null;
  /** 이동 버튼. 알 수 없는 종류면 null */
  action: { label: string } | null;
};

const SYSTEM_KIND: Record<string, SystemCardKind> = { POLL: 'poll', ITINERARY: 'course' };

const SYSTEM_DEFAULT: Record<SystemCardKind, string> = {
  poll: '투표 소식이 있어요',
  course: '코스가 바뀌었어요',
  other: '여행 소식이 있어요',
};

const SYSTEM_ACTION: Record<SystemCardKind, { label: string } | null> = {
  poll: { label: '투표 보기' },
  course: { label: '코스 보기' },
  other: null,
};

/**
 * 시스템 메시지 카드(research R13). 종류는 target.type으로 나눈다(POLL 투표, ITINERARY 코스, 그 밖은 일반).
 * 서버가 아직 SYSTEM 메시지를 만들지 않아, 문구는 본문이 있으면 본문(첫 줄 제목, 나머지 설명), 없으면 종류별 기본 문구다
 */
export function systemCard(message: Message): SystemCard {
  const kind = (message.target && SYSTEM_KIND[message.target.type]) || 'other';
  const [first, ...rest] = (message.text ?? '').split('\n');
  const title = first.trim() || SYSTEM_DEFAULT[kind];
  const body = rest.join('\n').trim() || null;
  return { kind, title, body, action: SYSTEM_ACTION[kind] };
}

/** 시스템 메시지 미리보기(S46). 카드 제목과 같다 */
export function systemText(message: Message): string {
  return systemCard(message).title;
}

/** S46 한 줄의 최근 메시지 미리보기 */
export function roomPreview(room: ChatRoom, meId: string | null): string {
  const m = room.lastMessage;
  if (!m) return '아직 메시지가 없어요';
  if (m.type === 'SYSTEM') return systemText(m);
  if (m.deletedAt) return '삭제된 메시지예요';
  const who = m.senderId === meId ? '나' : senderLabel(m, room.participants);
  return `${who}: ${(m.text ?? '').replace(/\s+/g, ' ').trim()}`;
}

/** S46 시각. 오늘이면 "20:12", 어제면 "어제", 올해면 "11.16", 그 전이면 "2025.11.16" */
export function roomTimeLabel(iso: string, now: Date = new Date()): string {
  const { date, hh, mm } = seoulParts(iso);
  const today = seoulParts(now.toISOString()).date;
  if (date === today) return `${hh}:${mm}`;
  const yesterday = seoulParts(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()).date;
  if (date === yesterday) return '어제';
  const [y, mo, d] = date.split('-');
  return y === today.slice(0, 4) ? `${mo}.${d}` : `${y}.${mo}.${d}`;
}

/** 메시지 시각(서울). "18:02" */
export function messageTimeLabel(iso: string): string {
  const { hh, mm } = seoulParts(iso);
  return `${hh}:${mm}`;
}

/** 서울 날짜 'YYYY-MM-DD'. 날짜 구분 줄 기준 */
export function seoulDateOf(iso: string): string {
  return seoulParts(iso).date;
}

/** 날짜 구분 줄(피그마 S47 "11.18(수)") */
export function dayDividerLabel(date: string): string {
  return formatDay(date);
}
