import type { ReactNode } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';

import { EmptyState, ErrorState } from '@/components/ui';
import { colors, layout, spacing, typography } from '@/theme';

import type { ChatRoomRow, ChatRoomsStatus, FeaturedChatRoom } from '../hooks/use-chat-rooms';

import { FeaturedRoomCard } from './featured-room-card';
import { ROOM_FACES_WIDTH, RoomRow } from './room-row';

type Props = {
  /** 맨 위 파랑 카드로 보일 지금 여행의 방. 없으면 목록만 */
  featured: FeaturedChatRoom | null;
  /** 나머지 방(최근 메시지 순) */
  rows: ChatRoomRow[];
  meId: string | null;
  status: ChatRoomsStatus;
  /**
   * 끊김 안내. 화면은 ConnectionBanner를, /dev/chats는 ConnectionBannerView를 넣는다.
   * 안내가 없으면 자리를 차지하지 않도록 여백(BANNER_STYLE)은 안내 카드 쪽에 준다
   */
  banner?: ReactNode;
  refreshing: boolean;
  onRefresh: () => void;
  onRetry: () => void;
  onOpen: (row: ChatRoomRow) => void;
  onCreateTrip: () => void;
  /** 상단 안전 영역 */
  topInset: number;
};

/**
 * S46 대화방 목록(C안 "지금 여행 먼저", 2026-11-05 사용자 선택).
 * 지금 여행(여행 중 → 다가오는 여행)의 방은 파랑 카드로 크게, 나머지는 동행 얼굴과 함께 목록으로 둔다.
 * 상태를 속성으로만 받아 서버·연결 없이 /dev/chats에서 그대로 그린다
 */
export function ChatRoomListView({
  featured,
  rows,
  meId,
  status,
  banner,
  refreshing,
  onRefresh,
  onRetry,
  onOpen,
  onCreateTrip,
  topInset,
}: Props) {
  let body: ReactNode;
  if (status === 'loading') {
    body = <Spinner style={styles.loading} color={colors.brand.primary} />;
  } else if (status === 'error') {
    body = <ErrorState onRetry={onRetry} />;
  } else if (status === 'empty') {
    // 1:1 채팅이 없으므로 [새 대화] 대신 [여행 만들기](디자인 결정 S46 대화방 없음)
    body = (
      <EmptyState
        icon="people"
        title="아직 대화방이 없어요"
        description={'여행을 만들거나 초대받으면\n대화방이 생겨요'}
        actionLabel="여행 만들기"
        onAction={onCreateTrip}
      />
    );
  }

  const header = (
    <>
      {banner}
      {featured ? (
        <FeaturedRoomCard room={featured} meId={meId} onPress={() => onOpen(featured)} />
      ) : null}
      {featured && rows.length > 0 ? (
        <Text style={[typography.captionMedium, styles.section]}>다른 대화방</Text>
      ) : null}
    </>
  );

  return (
    <View style={[styles.screen, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Text style={[typography.title1, styles.heading]} accessibilityRole="header">
          채팅
        </Text>
      </View>
      {body ? (
        <View style={styles.flex}>
          {banner}
          {body}
        </View>
      ) : (
        <FlatList
          style={styles.flex}
          data={rows}
          keyExtractor={(row) => row.room.id}
          contentContainerStyle={styles.content}
          ListHeaderComponent={header}
          ItemSeparatorComponent={Separator}
          renderItem={({ item }) => (
            <RoomRow
              title={item.title}
              preview={item.preview}
              time={item.time}
              participants={item.room.participants}
              meId={meId}
              onPress={() => onOpen(item)}
            />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
    </View>
  );
}

/** 끊김 안내 카드의 자리. 화면 좌우 20, 아래 20(피그마 Main Content gap 20) */
export const BANNER_STYLE = {
  marginHorizontal: layout.screenPaddingX,
  marginBottom: spacing[20],
};

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  // 상단 바: 높이 56, 왼쪽 20(피그마 Header)
  header: {
    height: 56,
    justifyContent: 'center',
    paddingHorizontal: layout.screenPaddingX,
  },
  heading: { color: colors.text.default },
  // 로딩 동그라미를 남은 화면의 정중앙에 둔다
  loading: { flex: 1 },
  content: { paddingTop: spacing[8], paddingBottom: spacing[32] },
  section: {
    color: colors.text.sub,
    paddingHorizontal: layout.screenPaddingX,
    marginTop: spacing[24],
    marginBottom: spacing[4],
  },
  // 줄 사이 선은 이름 글자 시작에 맞춘다(화면 여백 20 + 얼굴 자리 + 간격 14)
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: layout.screenPaddingX + ROOM_FACES_WIDTH + spacing[14],
    marginRight: layout.screenPaddingX,
    backgroundColor: colors.line.default,
  },
});
