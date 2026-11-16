import { describe, expect, it, jest } from '@jest/globals';
import type { UserCard } from '@/api/types';
import { act, render } from '@testing-library/react-native';
import { useEffect, useMemo, useState } from 'react';

import { toChatItems } from './chat-items';
import { ChatRoomView } from './components/chat-room-view';
import { emptyWindow, mergeMessages } from './message-merge';
import { msg } from './testing';
import type { Message, MessageWindow } from './types';

/**
 * 렌더 측정(트러블슈팅 D3). 대화방이 열린 상태에서 실시간 메시지가 하나씩 올 때 말풍선(MessageBubble)이 몇 번 그려지는지 센다.
 * 앱은 React Compiler를 켜고 빌드하므로 같은 조건으로 재려면 컴파일러를 켠 설정으로 돌린다.
 *   npm run bench -- chat-render
 */

let mockBubbleRenders = 0;
jest.mock('./components/message-bubble', () => {
  const actual = jest.requireActual<typeof import('./components/message-bubble')>(
    './components/message-bubble',
  );
  return {
    MessageBubble: (props: Parameters<typeof actual.MessageBubble>[0]) => {
      mockBubbleRenders += 1;
      return actual.MessageBubble(props);
    },
  };
});

// 공통 UI는 이 측정과 관계없어 가벼운 대역으로 둔다(하단 시트·지도 모듈을 불러오지 않음)
jest.mock('@/components/ui', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const Stub = () => createElement(View);
  return { Avatar: Stub, ErrorState: Stub, Header: Stub, Icon: Stub };
});

const person = (id: string, nickname: string): UserCard => ({
  id,
  nickname,
  profileImageUrl: null,
  accountVisibility: 'PUBLIC',
  followingStatus: 'NONE',
  followedByStatus: 'NONE',
});
const PARTICIPANTS = [person('user-a', '나'), person('user-b', '친구1'), person('user-c', '친구2')];

function message(sequence: number): Message {
  return msg(sequence, {
    senderId: PARTICIPANTS[sequence % PARTICIPANTS.length].id,
    createdAt: new Date(Date.UTC(2026, 10, 5) + sequence * 40_000).toISOString(),
  });
}

const noop = () => undefined;
/** 테스트가 방에 실시간 메시지를 넣는 손잡이 */
const handle: { push: (m: Message) => void } = { push: noop };

function Room({ initial }: { initial: MessageWindow }) {
  const [window, setWindow] = useState(initial);
  useEffect(() => {
    handle.push = (m) => setWindow((w) => mergeMessages(w, [m]));
  }, []);
  const items = useMemo(
    () => toChatItems(window, [], { meId: 'user-a', participants: PARTICIPANTS }),
    [window],
  );
  return (
    <ChatRoomView
      title="방"
      memberCount={3}
      status="ready"
      items={items}
      hasOlder={false}
      olderState="idle"
      onLoadOlder={noop}
      onRetry={noop}
      onResend={noop}
      onDiscard={noop}
    />
  );
}

const INITIAL = 30;
const INCOMING = 20;

describe('실시간 메시지가 올 때 말풍선 렌더 횟수', () => {
  it(`메시지 ${INITIAL}개 방에 ${INCOMING}개가 하나씩 온다`, async () => {
    const initial = mergeMessages(
      emptyWindow('room-1'),
      Array.from({ length: INITIAL }, (_, i) => message(i + 1)),
    );
    await render(<Room initial={initial} />);
    mockBubbleRenders = 0;
    for (let i = 1; i <= INCOMING; i += 1) {
      await act(async () => handle.push(message(INITIAL + i)));
    }
    console.log(
      `[bench] 말풍선 렌더: 메시지 ${INCOMING}개 동안 ${mockBubbleRenders}번 (메시지당 ${(mockBubbleRenders / INCOMING).toFixed(1)}번)`,
    );
    expect(mockBubbleRenders).toBeGreaterThan(0);
  });
});
