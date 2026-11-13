import { describe, expect, it } from '@jest/globals';
import { AxiosError, AxiosHeaders } from 'axios';

import type { UserCard } from '@/api/types';

import {
  cleanMessageText,
  isBlocked,
  roomPreview,
  roomTimeLabel,
  sendFailure,
  senderLabel,
  sortRooms,
  systemCard,
  validateMessageText,
} from './chat-rules';
import { httpError, msg } from './testing';
import type { ChatRoom } from './types';

describe('보내기 전 확인', () => {
  it('공백·줄바꿈만 있으면 empty', () => {
    expect(validateMessageText('  ')).toBe('empty');
    expect(validateMessageText('\n\n')).toBe('empty');
    expect(validateMessageText('')).toBe('empty');
  });

  it('1,000자는 ok, 1,001자는 tooLong', () => {
    expect(validateMessageText('가'.repeat(1000))).toBe('ok');
    expect(validateMessageText('가'.repeat(1001))).toBe('tooLong');
  });

  it('이모지는 코드 포인트로 센다', () => {
    expect(validateMessageText('😀'.repeat(1000))).toBe('ok');
    expect(validateMessageText('😀'.repeat(1001))).toBe('tooLong');
  });

  it('NUL 문자를 지운다', () => {
    expect(cleanMessageText('안\0녕')).toBe('안녕');
  });

  it('앞뒤 공백과 줄바꿈을 지운다', () => {
    expect(cleanMessageText(' 안\0녕 ')).toBe('안녕');
    expect(cleanMessageText('안녕\n')).toBe('안녕');
    expect(cleanMessageText('\n\n  안녕  \n')).toBe('안녕');
  });

  it('글 중간의 줄바꿈과 공백은 그대로 둔다', () => {
    expect(cleanMessageText('첫 줄\n\n둘째  줄\n')).toBe('첫 줄\n\n둘째  줄');
  });

  it('길이는 앞뒤 공백을 지운 글로 센다', () => {
    expect(validateMessageText('가'.repeat(1000) + '\n')).toBe('ok');
    expect(validateMessageText('  ' + '가'.repeat(1001))).toBe('tooLong');
  });

  it('NUL 문자만 있으면 empty', () => {
    expect(validateMessageText('\0')).toBe('empty');
  });
});

describe('보내기 실패 분류', () => {
  it('네트워크·시간 초과·5xx·429는 retry', () => {
    expect(sendFailure(httpError(null))).toBe('retry');
    const config = { headers: new AxiosHeaders() };
    expect(sendFailure(new AxiosError('timeout', 'ECONNABORTED', config))).toBe('retry');
    expect(sendFailure(httpError(500, 'INTERNAL_ERROR'))).toBe('retry');
    expect(sendFailure(httpError(429, 'RATE_LIMITED'))).toBe('retry');
  });

  it('404 CHAT_ROOM_NOT_FOUND는 blocked', () => {
    expect(sendFailure(httpError(404, 'CHAT_ROOM_NOT_FOUND'))).toBe('blocked');
  });

  it('400·409 CLIENT_MESSAGE_ID_REUSED는 rejected', () => {
    expect(sendFailure(httpError(400, 'VALIDATION_ERROR'))).toBe('rejected');
    expect(sendFailure(httpError(409, 'CLIENT_MESSAGE_ID_REUSED'))).toBe('rejected');
  });
});

describe('차단 응답', () => {
  it('TRIP_NOT_FOUND·CHAT_ROOM_NOT_FOUND만 차단이다', () => {
    expect(isBlocked(httpError(404, 'TRIP_NOT_FOUND'))).toBe(true);
    expect(isBlocked(httpError(404, 'CHAT_ROOM_NOT_FOUND'))).toBe(true);
    expect(isBlocked(httpError(404, 'NOT_FOUND'))).toBe(false);
    expect(isBlocked(httpError(null))).toBe(false);
  });
});

const person = (id: string, nickname: string): UserCard => ({
  id,
  nickname,
  profileImageUrl: null,
  accountVisibility: 'PUBLIC',
  followingStatus: 'NONE',
  followedByStatus: 'NONE',
});
const SEEUN = person('user-b', '세은');
const ME = person('me', '영광');

const room = (id: string, last: ChatRoom['lastMessage']): ChatRoom => ({
  id,
  type: 'TRIP',
  tripId: `trip-${id}`,
  participants: [ME, SEEUN],
  lastMessage: last,
});

describe('대화방 목록 정렬', () => {
  it('최근 메시지 순이고, 메시지 없는 방은 뒤에 서버 순서를 지킨다', () => {
    const rooms = [
      room('a', null),
      room('b', msg(3, { createdAt: '2026-11-05T01:00:00Z' })),
      room('c', null),
      room('d', msg(9, { createdAt: '2026-11-05T05:00:00Z' })),
    ];
    expect(sortRooms(rooms).map((r) => r.id)).toEqual(['d', 'b', 'a', 'c']);
  });
});

describe('대화방 한 줄 미리보기', () => {
  it('지운 메시지·내 메시지·남의 메시지·나간 사람·메시지 없음', () => {
    expect(
      roomPreview(room('a', msg(1, { text: null, deletedAt: '2026-11-05T01:00:00Z' })), 'me'),
    ).toBe('삭제된 메시지예요');
    expect(roomPreview(room('a', msg(1, { senderId: 'me', text: '안녕' })), 'me')).toBe('나: 안녕');
    expect(roomPreview(room('a', msg(1, { text: '여기\n가요' })), 'me')).toBe('세은: 여기 가요');
    expect(roomPreview(room('a', msg(1, { senderId: 'gone', text: '잘 가요' })), 'me')).toBe(
      '나간 동행: 잘 가요',
    );
    expect(roomPreview(room('a', null), 'me')).toBe('아직 메시지가 없어요');
  });

  it('보낸 사람 이름은 지금 동행에서 찾고 시스템 메시지는 이름이 없다', () => {
    expect(senderLabel(msg(1), [SEEUN])).toBe('세은');
    expect(senderLabel(msg(1, { senderId: 'gone' }), [SEEUN])).toBe('나간 동행');
    expect(senderLabel(msg(1, { type: 'SYSTEM', senderId: null }), [SEEUN])).toBeNull();
  });
});

describe('대화방 시각', () => {
  const now = new Date('2026-11-05T12:00:00Z'); // 서울 21:00

  it('서울 기준 오늘이면 시:분, 어제면 어제, 올해면 월.일, 그 전이면 연.월.일', () => {
    expect(roomTimeLabel('2026-11-05T11:12:00Z', now)).toBe('20:12');
    expect(roomTimeLabel('2026-11-04T15:00:00Z', now)).toBe('00:00'); // 서울 11.5 0시는 오늘
    expect(roomTimeLabel('2026-11-04T14:59:00Z', now)).toBe('어제');
    expect(roomTimeLabel('2026-11-01T03:00:00Z', now)).toBe('11.01');
    expect(roomTimeLabel('2025-12-31T03:00:00Z', now)).toBe('2025.12.31');
  });
});

describe('시스템 카드', () => {
  const system = (target: { type: string; id: string } | null, text: string | null) =>
    msg(1, { type: 'SYSTEM', senderId: null, target, text });

  it('POLL은 투표 카드와 [투표 보기], ITINERARY는 코스 카드와 [코스 보기]', () => {
    expect(systemCard(system({ type: 'POLL', id: 'p1' }, null))).toEqual({
      kind: 'poll',
      title: '투표 소식이 있어요',
      body: null,
      action: { label: '투표 보기' },
    });
    expect(systemCard(system({ type: 'ITINERARY', id: 't1' }, null))).toMatchObject({
      kind: 'course',
      title: '코스가 바뀌었어요',
      action: { label: '코스 보기' },
    });
  });

  it('모르는 종류나 대상이 없으면 버튼 없는 일반 카드', () => {
    expect(systemCard(system({ type: 'SOMETHING', id: 'x' }, null))).toMatchObject({
      kind: 'other',
      title: '여행 소식이 있어요',
      action: null,
    });
    expect(systemCard(system(null, null)).action).toBeNull();
  });

  it('본문이 있으면 첫 줄은 제목, 나머지는 설명', () => {
    expect(
      systemCard(system({ type: 'POLL', id: 'p1' }, '투표가 시작됐어요\n후보 3곳 · 21:00 마감')),
    ).toMatchObject({ title: '투표가 시작됐어요', body: '후보 3곳 · 21:00 마감' });
  });

  it('대화방 목록 미리보기는 카드 제목이다', () => {
    const room: ChatRoom = {
      id: 'r',
      type: 'TRIP',
      tripId: 't',
      participants: [],
      lastMessage: system({ type: 'ITINERARY', id: 't' }, null),
    };
    expect(roomPreview(room, 'me')).toBe('코스가 바뀌었어요');
  });
});
