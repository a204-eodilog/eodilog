import { SCROLL_DECELERATION } from '@/theme/scroll';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { UserCard } from '@/api/types';
import { Button } from '@/components/ui';
import { toChatItems } from '@/features/chat/chat-items';
import { roomPreview, roomTimeLabel } from '@/features/chat/chat-rules';
import { BANNER_STYLE, ChatRoomListView } from '@/features/chat/components/chat-room-list-view';
import {
  CHAT_BANNER_STYLE,
  ChatRoomView,
  type ChatRoomStatus,
} from '@/features/chat/components/chat-room-view';
import { Composer } from '@/features/chat/components/composer';
import { ConnectionBannerView } from '@/features/chat/components/connection-banner';
import { SystemCard } from '@/features/chat/components/system-card';
import type {
  ChatRoomRow,
  ChatRoomsStatus,
  FeaturedChatRoom,
} from '@/features/chat/hooks/use-chat-rooms';
import type { OlderState } from '@/features/chat/hooks/use-messages';
import { emptyWindow, mergeMessages } from '@/features/chat/message-merge';
import type { ChatRoom, Message, OutboxItem } from '@/features/chat/types';
import { colors, layout, spacing, typography } from '@/theme';

/**
 * 개발용 S46·S47 상태 보기. 서버·연결 없이 표시 부품(ChatRoomListView·ChatRoomView)에 예시 데이터를 넘겨 그린다.
 * 피그마 상태(docs/design/screens/README.md의 S46·S47 줄)와 피그마에 없는 상태를 모두 둔다. /dev/chats로만 들어온다
 */

function person(id: string, nickname: string): UserCard {
  return {
    id,
    nickname,
    profileImageUrl: null,
    accountVisibility: 'PUBLIC',
    followingStatus: 'NONE',
    followedByStatus: 'NONE',
  };
}

const ME = person('me', '영광');
const SEEUN = person('seeun', '세은');
const SEUNGGI = person('seunggi', '승기');
const PEOPLE = [ME, SEEUN, SEUNGGI];

const NOW = Date.now();
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

let seq = 0;
function message(over: Partial<Message> & { minutesAgo: number }): Message {
  seq += 1;
  const { minutesAgo, ...rest } = over;
  return {
    id: `m-${seq}`,
    roomId: 'room-1',
    sequence: seq,
    senderId: SEEUN.id,
    type: 'TEXT',
    text: '',
    clientMessageId: null,
    eventId: null,
    target: null,
    eventReadAt: null,
    createdAt: at(minutesAgo),
    deletedAt: null,
    ...rest,
  };
}

const BASIC = [
  message({ text: '사진 다 올렸어요', minutesAgo: 26 * 60 }),
  message({ senderId: SEUNGGI.id, text: '좋아요, 다음엔 거기 가요', minutesAgo: 26 * 60 - 2 }),
  message({ senderId: 'gone', text: '저는 이번엔 못 갈 것 같아요', minutesAgo: 26 * 60 - 4 }),
  message({ text: null, deletedAt: at(60), minutesAgo: 26 * 60 - 6 }),
  message({
    senderId: ME.id,
    text: '공동 피드 게시했어요. 숨길 친구 있으면 설정해요',
    minutesAgo: 30,
  }),
  message({ text: '오늘 저녁에 같이 정해요', minutesAgo: 20 }),
  message({ text: '7시 어때요?', minutesAgo: 20 }),
];

const SYSTEMS = [
  message({
    type: 'SYSTEM',
    senderId: null,
    target: { type: 'POLL', id: 'p1' },
    text: '투표가 시작됐어요\n후보 3곳 · 10.28(수) 21:00 마감',
    minutesAgo: 3 * 24 * 60,
  }),
  message({
    type: 'SYSTEM',
    senderId: null,
    target: { type: 'POLL', id: 'p1' },
    text: '투표가 마감됐어요\n3명 모두 투표했어요 · 마감 시각에 확정',
    minutesAgo: 2 * 24 * 60,
  }),
  message({
    type: 'SYSTEM',
    senderId: null,
    target: { type: 'ITINERARY', id: 't1' },
    text: '코스가 바뀌었어요\n세은님이 2일차 순서를 바꿨어요',
    minutesAgo: 24 * 60,
  }),
  message({ type: 'SYSTEM', senderId: null, target: null, text: null, minutesAgo: 60 }),
];

const OUTBOX: OutboxItem[] = [
  {
    clientMessageId: 'o1',
    roomId: 'room-1',
    text: '다음 여행은 강릉 어때요?',
    status: 'sending',
    failure: null,
    queuedAt: 1,
  },
  {
    // 연결이 끊겨 기다리는 중. 연결되면 자동으로 보낸다
    clientMessageId: 'o1w',
    roomId: 'room-1',
    text: '지하철이라 연결이 끊겼어요',
    status: 'sending',
    failure: null,
    queuedAt: 1.5,
    waiting: true,
  },
  {
    clientMessageId: 'o2',
    roomId: 'room-1',
    text: '주말에 시간 돼요?',
    status: 'failed',
    failure: 'retry',
    queuedAt: 2,
  },
];

const REJECTED: OutboxItem[] = [
  {
    clientMessageId: 'o3',
    roomId: 'room-1',
    text: '거절된 메시지',
    status: 'failed',
    failure: 'rejected',
    queuedAt: 3,
  },
];

function items(messages: Message[], outbox: OutboxItem[] = []) {
  const window = mergeMessages(emptyWindow('room-1'), messages, { hasOlder: true });
  return toChatItems(window, outbox, { meId: ME.id, participants: PEOPLE });
}

function room(id: string, last: Message | null): ChatRoom {
  return { id, type: 'TRIP', tripId: `trip-${id}`, participants: PEOPLE, lastMessage: last };
}

const ROWS: ChatRoomRow[] = [
  { r: room('a', BASIC[6]), title: '겨울 여행', unread: 3 },
  { r: room('b', BASIC[1]), title: '부산 1박 2일', unread: 120 },
  { r: room('c', null), title: '연말 강릉', unread: 0 },
].map(({ r, title, unread }) => ({
  room: r,
  title,
  preview: roomPreview(r, ME.id),
  time: r.lastMessage ? roomTimeLabel(r.lastMessage.createdAt) : null,
  unread,
}));

/** C안 맨 위 카드 예시: 지금 여행 중인 방 */
const FEATURED: FeaturedChatRoom = {
  ...ROWS[0],
  title: '부산 바다 여행',
  kicker: '여행 중 · 2일차',
};

type ListExample = {
  kind: 'list';
  status: ChatRoomsStatus;
  banner?: boolean;
  /** 지금 여행 카드 없이(여행 중·다가오는 여행이 없을 때) */
  noFeatured?: boolean;
};
type RoomExample = {
  kind: 'room';
  status: ChatRoomStatus;
  messages?: Message[];
  outbox?: OutboxItem[];
  older?: OlderState;
  banner?: boolean;
  newMessage?: boolean;
  text?: string;
  title?: string;
};
type Example = ListExample | RoomExample;

const EXAMPLES: { label: string; group: string; example: Example }[] = [
  { group: 'S46', label: '기본', example: { kind: 'list', status: 'ready' } },
  { group: 'S46', label: '대화방 없음', example: { kind: 'list', status: 'empty' } },
  { group: 'S46', label: '연결 끊김', example: { kind: 'list', status: 'ready', banner: true } },
  {
    group: 'S46',
    label: '지금 여행 없음',
    example: { kind: 'list', status: 'ready', noFeatured: true },
  },
  { group: 'S46', label: '로딩', example: { kind: 'list', status: 'loading' } },
  { group: 'S46', label: '불러오기 실패', example: { kind: 'list', status: 'error' } },
  {
    group: 'S47',
    label: '기본·보내는 중·실패',
    example: { kind: 'room', status: 'ready', messages: BASIC, outbox: OUTBOX },
  },
  { group: 'S47', label: '비참여자 차단', example: { kind: 'room', status: 'blocked' } },
  {
    group: 'S47',
    label: '시스템 메시지 모음',
    example: { kind: 'room', status: 'ready', messages: SYSTEMS, title: '시스템 메시지 모음' },
  },
  {
    group: 'S47',
    label: '투표 시스템 메시지',
    example: { kind: 'room', status: 'ready', messages: [...BASIC.slice(0, 2), SYSTEMS[0]] },
  },
  {
    group: 'S47',
    label: '코스 시스템 메시지',
    example: { kind: 'room', status: 'ready', messages: [...BASIC.slice(0, 2), SYSTEMS[2]] },
  },
  { group: 'S47 그 밖', label: '로딩', example: { kind: 'room', status: 'loading' } },
  {
    group: 'S47 그 밖',
    label: '빈 대화방',
    example: { kind: 'room', status: 'ready', messages: [] },
  },
  { group: 'S47 그 밖', label: '불러오기 실패', example: { kind: 'room', status: 'error' } },
  {
    group: 'S47 그 밖',
    label: '이전 메시지 받는 중',
    example: { kind: 'room', status: 'ready', messages: BASIC, older: 'loading' },
  },
  {
    group: 'S47 그 밖',
    label: '이전 메시지 실패',
    example: { kind: 'room', status: 'ready', messages: BASIC, older: 'error' },
  },
  {
    group: 'S47 그 밖',
    label: '새 메시지 버튼',
    example: { kind: 'room', status: 'ready', messages: BASIC, newMessage: true },
  },
  {
    group: 'S47 그 밖',
    label: '1,000자 초과',
    example: { kind: 'room', status: 'ready', messages: BASIC, text: '가'.repeat(1001) },
  },
  {
    group: 'S47 그 밖',
    label: '다시 보낼 수 없는 실패',
    example: { kind: 'room', status: 'ready', messages: BASIC, outbox: REJECTED },
  },
  {
    group: 'S47 그 밖',
    label: '연결 끊김',
    example: { kind: 'room', status: 'ready', messages: BASIC, banner: true },
  },
];

const noop = () => undefined;

export default function ChatStates() {
  const insets = useSafeAreaInsets();
  const [example, setExample] = useState<Example | null>(null);
  const back = () => setExample(null);

  if (example?.kind === 'list') {
    return (
      <ChatRoomListView
        featured={example.noFeatured ? null : FEATURED}
        rows={example.noFeatured ? ROWS : ROWS.slice(1)}
        meId={ME.id}
        status={example.status}
        banner={
          example.banner ? <ConnectionBannerView stopped={false} style={BANNER_STYLE} /> : undefined
        }
        refreshing={false}
        onRefresh={noop}
        onRetry={back}
        onOpen={back}
        onCreateTrip={back}
        topInset={insets.top}
      />
    );
  }

  if (example?.kind === 'room') {
    return (
      <ChatRoomView
        title={example.title ?? '겨울 여행'}
        memberCount={PEOPLE.length}
        status={example.status}
        items={items(example.messages ?? [], example.outbox)}
        hasOlder={!!example.older}
        olderState={example.older ?? 'idle'}
        onLoadOlder={noop}
        onRetry={back}
        onResend={noop}
        onDiscard={noop}
        renderSystem={(item) => <SystemCard message={item.message} tripId="trip-1" />}
        banner={
          example.banner ? (
            <ConnectionBannerView stopped={false} style={CHAT_BANNER_STYLE} />
          ) : undefined
        }
        composer={<Composer onSend={noop} initialText={example.text} />}
        onLeaveBlocked={back}
        previewNewMessage={example.newMessage}
      />
    );
  }

  const groups = [...new Set(EXAMPLES.map((e) => e.group))];
  return (
    <ScrollView
      decelerationRate={SCROLL_DECELERATION}
      style={styles.screen}
      contentContainerStyle={styles.menu}
    >
      {groups.map((group) => (
        <View key={group} style={styles.group}>
          <Text style={[typography.subBold, styles.heading]}>{group}</Text>
          <View style={styles.row}>
            {EXAMPLES.filter((e) => e.group === group).map((e) => (
              <Button
                key={e.label}
                label={e.label}
                variant="neutral"
                onPress={() => setExample(e.example)}
              />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  menu: { padding: layout.screenPaddingX, paddingTop: 80, gap: spacing[24] },
  group: { gap: spacing[8] },
  heading: { color: colors.text.default },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
});
