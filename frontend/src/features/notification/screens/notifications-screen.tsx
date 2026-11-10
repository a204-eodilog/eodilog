import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Header } from '@/components/ui';
import { colors, layout, spacing, typography } from '@/theme';

import { NotificationRow } from '../components/notification-row';
import { NotificationsEmpty, NotificationsError } from '../components/notification-states';
import { useNotifications } from '../hooks/use-notifications';
import { useOpenNotification } from '../hooks/use-open-notification';
import { toSections, type NotificationLine, type Section } from '../notification-rules';

export type NotificationsViewProps = {
  status: 'loading' | 'error' | 'ready';
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
  const readAll =
    status === 'ready' && sections.length > 0 ? (
      <Pressable
        onPress={props.onReadAll}
        disabled={!props.canReadAll}
        accessibilityRole="button"
        accessibilityState={{ disabled: !props.canReadAll }}
        style={({ pressed }) => [styles.readAll, pressed && styles.pressed]}
      >
        <Text
          style={[typography.bodyMedium, props.canReadAll ? styles.readAllOn : styles.readAllOff]}
        >
          모두 읽음
        </Text>
      </Pressable>
    ) : undefined;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <Header title="알림" largeTitle onBack={props.onBack} right={readAll} />
      {status === 'loading' ? (
        <ActivityIndicator style={styles.loading} color={colors.brand.primary} />
      ) : status === 'error' ? (
        <NotificationsError onRetry={props.onRetry} />
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
          renderItem={({ item }) => (
            <NotificationRow line={item} onPress={() => props.onOpen(item)} />
          )}
          ItemSeparatorComponent={Gap}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          onEndReached={props.onEndReached}
          onEndReachedThreshold={0.4}
          initialNumToRender={20}
          ListFooterComponent={
            props.loadingMore ? (
              <ActivityIndicator style={styles.more} color={colors.brand.primary} />
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
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing[12],
  },
  readAllOn: { color: colors.brand.primaryDark },
  readAllOff: { color: colors.text.muted },
  pressed: { opacity: 0.6 },
  list: { paddingHorizontal: layout.screenPaddingX, paddingTop: spacing[16] },
  sectionTitle: { color: colors.text.icon, marginBottom: spacing[8] },
  gap: { height: spacing[4] },
  // Figma 묶음 사이 24
  laterSection: { marginTop: spacing[24] },
  more: { marginVertical: spacing[16] },
  bottom: { height: 48 },
});
