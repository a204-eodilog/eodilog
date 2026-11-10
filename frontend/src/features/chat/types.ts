import type { UserCard } from '@/api/types';

/** 여행 그룹 대화방. 여행 하나에 하나다. 이름은 따로 없고 여행 이름을 쓴다 */
export type ChatRoom = {
  id: string;
  type: 'TRIP';
  tripId: string;
  /** 지금 참여 중인 동행(참여 순) */
  participants: UserCard[];
  /** 가장 최근 메시지. 아직 없으면 null */
  lastMessage: Message | null;
};

/** 시스템 카드가 가리키는 대상. 서버가 아직 채우지 않는다(항상 null) */
export type MessageTarget = { type: string; id: string };

export type Message = {
  id: string;
  roomId: string;
  /** 방 안의 순번. 1부터 빈틈없이 늘어난다 */
  sequence: number;
  /** 보낸 사용자. 시스템 메시지는 null */
  senderId: string | null;
  type: 'TEXT' | 'SYSTEM';
  /** 지운 메시지·시스템 메시지는 null일 수 있다 */
  text: string | null;
  clientMessageId: string | null;
  eventId: string | null;
  target: MessageTarget | null;
  eventReadAt: string | null;
  /** 보낸 시각(UTC) */
  createdAt: string;
  /** 보낸 사람이 나가며 "내 채팅 삭제"를 고른 시각. 자리(순번)는 남는다 */
  deletedAt: string | null;
};

/** 메시지 목록 응답. data는 sequence 내림차순이다. DataResponse로 감싸지 않는다 */
export type MessagePage = {
  data: Message[];
  page: { nextBeforeSequence: number | null; hasNext: boolean };
};

/** /user/queue/chat으로 받는 이벤트 */
export type ChatRealtimeEvent = { type: 'MESSAGE_CREATED'; roomId: string; message: Message };

export type SendMessageBody = { clientMessageId: string; text: string };

/**
 * 한 방에서 지금까지 받은 메시지를 한 줄로 이어 둔 것(data-model.md "메시지 창").
 * 처음 받기·이전 메시지·실시간·빈칸 채우기·이어 받기·보내기 성공이 모두 mergeMessages를 거쳐 여기에 들어간다
 */
export type MessageWindow = {
  roomId: string;
  /** sequence 오름차순, 중복 없음 */
  messages: Message[];
  oldestSequence: number | null;
  newestSequence: number | null;
  /** 서버에 더 오래된 메시지가 있는지 */
  hasOlder: boolean;
  /** 연결이 끊겼던 사이 받지 못했을 수 있다. 열면 이어 받는다 */
  stale: boolean;
};

/** 이 기기에만 있는 보내는 중 메시지 */
export type OutboxItem = {
  /** 다시 보내도 같은 값 */
  clientMessageId: string;
  roomId: string;
  text: string;
  status: 'sending' | 'failed';
  /** rejected면 [다시 보내기]가 없다 */
  failure: 'retry' | 'rejected' | null;
  /** 보낸 순서. 화면 맨 아래 정렬 기준 */
  queuedAt: number;
  /** 연결 문제로 못 보내 연결이 돌아오길 기다리는 중(자동으로 다시 보냄). 화면에는 "보내는 중"으로 보인다 */
  waiting?: boolean;
  /** 자동으로 다시 보내기 시작한 시각(ms). 정해진 시간이 지나면 [다시 보내기]로 넘긴다 */
  retryingSince?: number | null;
};
