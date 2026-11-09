import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Text,
  View,
} from 'react-native';

import { ErrorState, Header, Icon } from '@/components/ui';
import { colors, layout, spacing, typography } from '@/theme';

import type { ChatItem } from '../chat-items';
import type { OlderState } from '../hooks/use-messages';

import { DayDivider } from './day-divider';
import { MessageBubble } from './message-bubble';
import { NewMessageButton } from './new-message-button';
import { OutboxBubble } from './outbox-bubble';

export type ChatRoomStatus = 'loading' | 'error' | 'ready' | 'blocked';

type Props = {
  title: string;
  /** 지금 동행 수. 모르면 null */
  memberCount: number | null;
  status: ChatRoomStatus;
  items: ChatItem[];
  hasOlder: boolean;
  olderState: OlderState;
  onLoadOlder: () => void;
  onRetry: () => void;
  onResend: (clientMessageId: string) => void;
  onDiscard: (clientMessageId: string) => void;
  /** 시스템 카드(SystemCard). 없으면 가운데 회색 한 줄로 보인다 */
  renderSystem?: (item: Extract<ChatItem, { kind: 'system' }>) => ReactNode;
  /** 끊김 안내. 안내가 없을 때 자리를 차지하지 않게 여백은 안내 카드 쪽에 준다(CHAT_BANNER_STYLE) */
  banner?: ReactNode;
  /** 아래 입력 칸 */
  composer?: ReactNode;
  /** 차단 화면의 [대화방 목록으로] */
  onLeaveBlocked?: () => void;
  /** /dev/chats 미리보기용. 스크롤과 관계없이 "새 메시지" 버튼을 보인다 */
  previewNewMessage?: boolean;
};

/** 맨 아래에서 이 거리 안이면 새 메시지가 올 때 따라 내려간다(FR-019) */
const FOLLOW_THRESHOLD = 80;

/** 목록 맨 끝 빈 줄. 떠 있는 입력 칸 높이만큼 자리를 비운다 */
type Row = ChatItem | { kind: 'bottom-space'; key: string };
const BOTTOM_SPACE: Row = { kind: 'bottom-space', key: '__bottom-space' };

/**
 * S47 대화방 표시(피그마 201-25069). 상태를 속성으로만 받아 /dev/chats에서 서버 없이 그대로 그린다.
 * 목록은 뒤집지 않은 FlashList이고 아래 기준으로 그린다. 위에 이전 메시지를 붙여도 읽던 자리를 지킨다(research R9)
 */
export function ChatRoomView({
  title,
  memberCount,
  status,
  items,
  hasOlder,
  olderState,
  onLoadOlder,
  onRetry,
  onResend,
  onDiscard,
  renderSystem,
  banner,
  composer,
  onLeaveBlocked,
  previewNewMessage = false,
}: Props) {
  const listRef = useRef<FlashListRef<Row>>(null);
  const [atBottom, setAtBottom] = useState(true);
  // 입력 칸은 목록 위에 떠 있다(배경 투명, 2026-11-05 사용자 요청). 마지막 메시지가 가리지 않게 그 높이만큼 아래를 띄운다
  const [composerHeight, setComposerHeight] = useState(0);

  // 가장 최근 서버 메시지. 맨 아래에서 떨어져 있는 동안 이것이 바뀌면 "새 메시지" 버튼을 띄운다(FR-019)
  const latest = lastServerItem(items);
  const [seenKey, setSeenKey] = useState<string | undefined>(latest?.key);
  const showNew =
    previewNewMessage || (!atBottom && !!latest && latest.key !== seenKey && !latest.mine);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distance = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    const nowBottom = distance < FOLLOW_THRESHOLD;
    if (nowBottom === atBottom) return;
    setAtBottom(nowBottom);
    // 맨 아래를 떠나는 순간까지 본 메시지를 기억한다
    if (!nowBottom) setSeenKey(latest?.key);
  };

  // 글이 길어져 입력 칸이 높아지면 맨 아래를 보던 대화도 같이 올린다(2026-11-05 사용자 요청)
  useEffect(() => {
    if (composerHeight > 0 && atBottom) listRef.current?.scrollToEnd({ animated: false });
    // 입력 칸 높이가 바뀔 때만 맞춘다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerHeight]);

  // 내가 보내면 맨 아래로 내려간다(T044)
  const lastOutboxKey =
    items.length > 0 && items[items.length - 1].kind === 'outbox'
      ? items[items.length - 1].key
      : null;
  useEffect(() => {
    if (lastOutboxKey) listRef.current?.scrollToEnd({ animated: true });
  }, [lastOutboxKey]);

  if (status === 'blocked') {
    return (
      <View style={styles.screen}>
        <Header title={title} />
        <BlockedNotice onLeave={onLeaveBlocked} />
      </View>
    );
  }

  // 입력 칸 자리는 contentContainerStyle의 paddingBottom이 아니라 목록 끝 빈 줄로 비운다.
  // FlashList는 메시지가 화면보다 적으면 아래에 붙여 그리는데(startRenderingFromBottom), 이 계산에 paddingBottom을 넣지 않아
  // 새로 연 방에서 마지막 메시지가 입력 칸 밑에 가려졌다(2026-11-06 기기 확인). 빈 줄은 목록 높이에 들어가 계산에 포함된다
  const rows: Row[] = items.length > 0 ? [...items, BOTTOM_SPACE] : items;
  const bottomSpace = composerHeight + spacing[8];

  let body: ReactNode;
  if (status === 'loading') {
    body = <ActivityIndicator style={styles.loading} color={colors.brand.primary} />;
  } else if (status === 'error') {
    body = <ErrorState onRetry={onRetry} />;
  } else {
    body = (
      <FlashList
        ref={listRef}
        data={rows}
        onScroll={onScroll}
        scrollEventThrottle={100}
        keyExtractor={(item) => item.key}
        getItemType={(item) =>
          item.kind === 'message' ? (item.message.senderId ? `m-${item.mine}` : 'm') : item.kind
        }
        maintainVisibleContentPosition={{
          startRenderingFromBottom: true,
          autoscrollToBottomThreshold: FOLLOW_THRESHOLD,
        }}
        onStartReached={hasOlder && olderState === 'idle' ? onLoadOlder : undefined}
        onStartReachedThreshold={0.5}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <OlderHeader state={hasOlder ? olderState : 'idle'} onRetry={onLoadOlder} />
        }
        ListEmptyComponent={
          <Text style={[typography.sub, styles.emptyText]}>첫 메시지를 보내 보세요</Text>
        }
        renderItem={({ item }) =>
          item.kind === 'bottom-space' ? (
            <View style={{ height: bottomSpace }} />
          ) : (
            <View style={styles.item}>
              {renderItem(item, { onResend, onDiscard, renderSystem })}
            </View>
          )
        }
        keyboardShouldPersistTaps="handled"
      />
    );
  }

  return (
    <View style={styles.screen}>
      <Header
        title={title}
        subtitle={memberCount !== null ? `${memberCount}명` : undefined}
        subtitleIcon="people"
      />
      <KeyboardAvoidingView
        style={styles.flex}
        // 안드로이드도 화면 끝까지 그리는 모드라 키보드만큼 직접 띄운다(기기 확인 항목)
        behavior="padding"
      >
        {banner}
        <View style={styles.flex}>
          {body}
          {showNew ? (
            <NewMessageButton
              bottom={composerHeight + spacing[12]}
              onPress={() => listRef.current?.scrollToEnd({ animated: true })}
            />
          ) : null}
          {composer ? (
            <View
              style={styles.composerLayer}
              pointerEvents="box-none"
              onLayout={(e) => setComposerHeight(Math.round(e.nativeEvent.layout.height))}
            >
              {composer}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/** 맨 아래 서버 메시지(사람·시스템). 보내는 중 메시지는 빼고 본다 */
function lastServerItem(items: ChatItem[]): { key: string; mine: boolean } | null {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item.kind === 'message') return { key: item.key, mine: item.mine };
    if (item.kind === 'system') return { key: item.key, mine: false };
  }
  return null;
}

/** 끊김 안내 카드의 자리(화면 좌우 20, 위 12) */
export const CHAT_BANNER_STYLE = {
  marginHorizontal: layout.screenPaddingX,
  marginTop: spacing[12],
};

function renderItem(
  item: ChatItem,
  handlers: Pick<Props, 'onResend' | 'onDiscard' | 'renderSystem'>,
): ReactNode {
  switch (item.kind) {
    case 'day':
      return <DayDivider label={item.label} />;
    case 'message':
      return (
        <MessageBubble
          text={item.message.text}
          mine={item.mine}
          showSender={item.showSender}
          senderName={item.senderName}
          senderImageUrl={item.senderImageUrl}
          time={item.time}
          deleted={item.deleted}
        />
      );
    case 'system':
      return handlers.renderSystem ? (
        handlers.renderSystem(item)
      ) : (
        <Text style={[typography.caption, styles.systemLine]}>
          {item.message.text ?? '여행 소식이 있어요'}
        </Text>
      );
    case 'outbox':
      return (
        <OutboxBubble item={item.item} onRetry={handlers.onResend} onDiscard={handlers.onDiscard} />
      );
  }
}

/**
 * S47 비참여자 차단(피그마 201-25215). 대화 내용과 입력 칸 없이 안내만 보인다(FR-024).
 * 피그마 [돌아가기] 자리에 대화방 목록으로 가는 글자 버튼을 둔다
 */
function BlockedNotice({ onLeave }: { onLeave?: () => void }) {
  return (
    <View style={styles.blocked}>
      <View style={styles.lockCircle}>
        <Icon name="lock" size={32} color={colors.text.icon} />
      </View>
      <Text style={[typography.title1, styles.blockedTitle]}>동행만 볼 수 있는 대화방이에요</Text>
      <Text style={[typography.body, styles.blockedBody]}>
        여행에서 나갔거나 여행이 삭제되면 대화를 볼 수 없어요
      </Text>
      {onLeave ? (
        <Pressable
          accessibilityRole="button"
          onPress={onLeave}
          style={({ pressed }) => [styles.blockedButton, pressed && styles.pressed]}
        >
          <Text style={[typography.bodyMedium, styles.blockedButtonText]}>대화방 목록으로</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** 목록 맨 위. 이전 메시지를 받는 중이면 동그라미, 실패하면 [다시 시도] 줄(FR-010) */
function OlderHeader({ state, onRetry }: { state: OlderState; onRetry: () => void }) {
  if (state === 'loading') {
    return <ActivityIndicator style={styles.older} color={colors.text.muted} />;
  }
  if (state === 'error') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="이전 메시지 다시 불러오기"
        onPress={onRetry}
        style={({ pressed }) => [styles.olderRetry, pressed && styles.pressed]}
      >
        <Icon name="refresh" size={16} color={colors.text.sub} />
        <Text style={[typography.captionMedium, styles.olderText]}>
          이전 메시지를 불러오지 못했어요. 다시 시도
        </Text>
      </Pressable>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  loading: { marginTop: spacing[32] },
  // 피그마 Main Content: 좌우 16, 위 16, 줄 사이 14
  content: { paddingHorizontal: spacing[16], paddingTop: spacing[16] },
  // 입력 칸 자리. 배경 없이 목록 위 아래쪽에 붙인다
  composerLayer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  item: { paddingBottom: spacing[14] },
  emptyText: { textAlign: 'center', color: colors.text.sub, marginTop: spacing[32] },
  systemLine: { textAlign: 'center', color: colors.text.sub },
  older: { marginBottom: spacing[14] },
  olderRetry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[4],
    minHeight: layout.minTouchTarget,
    marginBottom: spacing[6],
  },
  olderText: { color: colors.text.sub },
  pressed: { opacity: 0.6 },
  // 피그마 Main Content: 좌우 32, 아래 110(가운데보다 조금 위)
  blocked: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[32],
    paddingBottom: 110,
  },
  lockCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.default,
  },
  blockedTitle: { color: colors.text.default, textAlign: 'center', marginTop: spacing[20] },
  blockedBody: { color: colors.text.icon, textAlign: 'center', marginTop: spacing[8] },
  blockedButton: {
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing[16],
    marginTop: spacing[24],
  },
  blockedButtonText: { color: colors.text.icon },
});
