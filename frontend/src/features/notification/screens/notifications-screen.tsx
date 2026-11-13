import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Header, Icon } from '@/components/ui';
import { FadeIn } from '@/components/ui/fade-in';
import { PressableScale } from '@/components/ui/pressable-scale';
import { SkeletonList } from '@/components/ui/skeleton';
import { colors, layout, spacing, typography } from '@/theme';

import { NotificationRow } from '../components/notification-row';
import { NotificationsEmpty, NotificationsError } from '../components/notification-states';
import { useNotifications } from '../hooks/use-notifications';
import { useOpenNotification } from '../hooks/use-open-notification';
import { toSections, type NotificationLine, type Section } from '../notification-rules';

export type NotificationsViewProps = {
  status: 'loading' | 'error' | 'ready';
  /** 불러오기 실패의 원인 */
  error?: unknown;
  sections: Section[];
  canReadAll: boolean;
  loadingMore?: boolean;
  onBack: () => void;
  onReadAll: () => void;
  onOpen: (line: NotificationLine) => void;
  onRetry: () => void;
  onEndReached?: () => void;
};

/** S49 알림 목록 모양. 기본 201-25921 · 알림 없음 201-26140 · 불러오기 실패 201-32709 */
export function NotificationsView(props: NotificationsViewProps) {
  const { status, sections } = props;
  // 읽지 않은 알림이 있을 때만 보인다. 머리줄의 뒤로 버튼과 같은 44 크기 아이콘 버튼
  const readAll =
    status === 'ready' && props.canReadAll ? (
      <PressableScale
        onPress={props.onReadAll}
        accessibilityRole="button"
        accessibilityLabel="모두 읽음"
        style={({ pressed }) => [styles.readAll, pressed && styles.pressed]}
      >
        <Icon name="check-all" color={colors.text.default} />
      </PressableScale>
    ) : undefined;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <Header title="알림" largeTitle onBack={props.onBack} right={readAll} />
      {status === 'loading' ? (
        <SkeletonList style={styles.loading} />
      ) : status === 'error' ? (
        <NotificationsError onRetry={props.onRetry} error={props.error} />
      ) : sections.length === 0 ? (
        <NotificationsEmpty />
      ) : (
        <SectionList
          testID="notification-list"
          sections={sections.map((s) => ({ title: s.title, data: s.lines }))}
          keyExtractor={(line) => line.id}
          renderSectionHeader={({ section }) => (
            <Text
              style={[
                typography.captionMedium,
                styles.sectionTitle,
                section.title === '이전' && sections.length > 1 && styles.laterSection,
              ]}
            >
              {section.title}
            </Text>
          )}
          renderItem={({ item, index }) => (
            <FadeIn index={index}>
              <NotificationRow line={item} onPress={() => props.onOpen(item)} />
            </FadeIn>
          )}
          ItemSeparatorComponent={Gap}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          onEndReached={props.onEndReached}
          onEndReachedThreshold={0.4}
          initialNumToRender={20}
          ListFooterComponent={
            props.loadingMore ? (
              <Spinner style={styles.more} color={colors.brand.primary} />
            ) : (
              <View style={styles.bottom} />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const Gap = () => <View style={styles.gap} />;

/** S49 알림 목록. 홈 종 아이콘에서 연다 */
export function NotificationsScreen() {
  const list = useNotifications();
  const open = useOpenNotification();
  const [now] = useState(() => new Date());
  const sections = useMemo(
    () => toSections(list.items, now, list.myTripIds),
    [list.items, list.myTripIds, now],
  );
  return (
    <NotificationsView
      status={list.isPending ? 'loading' : list.isError ? 'error' : 'ready'}
      error={list.error}
      sections={sections}
      canReadAll={list.hasUnread}
      loadingMore={list.isFetchingNextPage}
      onBack={() => router.back()}
      onReadAll={() => void list.readAll()}
      onOpen={(line) => {
        const n = list.items.find((x) => x.id === line.id);
        // 나간 여행 표시가 있어도 여행을 받아 보고 정한다. 표시는 내 여행 목록으로 짐작한 것이다
        if (n) void open(n);
      }}
      onRetry={list.retry}
      onEndReached={list.loadMore}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  loading: { flex: 1 },
  readAll: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  // 줄이 카드라 카드 안쪽 12를 뺀 8만 띄운다. 글자는 예전처럼 화면 끝에서 20에 선다
  list: { paddingHorizontal: layout.screenPaddingX - spacing[12], paddingTop: spacing[16] },
  sectionTitle: {
    color: colors.text.icon,
    marginBottom: spacing[8],
    paddingHorizontal: spacing[12],
  },
  gap: { height: spacing[4] },
  // Figma 묶음 사이 24
  laterSection: { marginTop: spacing[24] },
  more: { marginVertical: spacing[16] },
  bottom: { height: 48 },
});
