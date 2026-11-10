import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Header, toast } from '@/components/ui';
import { ManyPopup, PollPopup } from '@/features/notification/components/notification-popup';
import { NotificationGone } from '@/features/notification/components/notification-states';
import {
  deadlineLine,
  notificationTitle,
  pollPopupTitle,
  popupTimeLabel,
  toLine,
  toSections,
} from '@/features/notification/notification-rules';
import { NotificationsView } from '@/features/notification/screens/notifications-screen';
import { SAMPLE_NOW, sampleNotifications, samplePopupItems } from '@/features/notification/testing';
import { colors, layout, spacing, typography } from '@/theme';

/**
 * 개발용 S48·S49 알림 상태 보기. 서버 없이 표시 부품에 예시 데이터를 넘겨 그린다.
 * /dev/notifications?state=list 처럼 상태를 바로 열 수 있다(contracts/routes.md)
 */

const EXAMPLES = [
  { state: 'list', label: 'S49 기본 201-25921' },
  { state: 'empty', label: 'S49 알림 없음 201-26140' },
  { state: 'gone', label: 'S49 볼 수 없음 201-26179' },
  { state: 'error', label: 'S49 불러오기 실패 201-32709' },
  { state: 'popup-many', label: 'S48 모아 보기 201-25425' },
  { state: 'popup-poll', label: 'S48 투표 시작 201-11808' },
];

const say = (text: string) => () => toast.show(text);

export default function DevNotifications() {
  const params = useLocalSearchParams<{ state?: string }>();
  const [state, setState] = useState<string | null>(params.state ?? null);
  const back = () => setState(null);

  if (state === 'list' || state === 'empty' || state === 'error') {
    return (
      <NotificationsView
        status={state === 'error' ? 'error' : 'ready'}
        sections={
          state === 'list' ? toSections(sampleNotifications(), SAMPLE_NOW, new Set(['trip-1'])) : []
        }
        canReadAll
        onBack={back}
        onReadAll={say('모두 읽음으로 바꿔요')}
        onOpen={(line) => toast.show(`${line.title} 화면으로 가요`)}
        onRetry={say('다시 받아요')}
      />
    );
  }
  if (state === 'gone') {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <Header title="알림" largeTitle onBack={back} />
        <NotificationGone onList={back} onDismiss={say('알림을 지웠어요')} />
      </SafeAreaView>
    );
  }
  if (state === 'popup-many') {
    const items = samplePopupItems();
    return (
      <View style={styles.screen}>
        <ManyPopup
          visible
          count={items.length}
          lines={items.map((n) => ({
            ...toLine(n, SAMPLE_NOW, null),
            time: popupTimeLabel(n.createdAt, SAMPLE_NOW),
          }))}
          onLine={(line) => toast.show(`${line.title} 화면으로 가요`)}
          onClose={back}
          onAll={back}
        />
      </View>
    );
  }
  if (state === 'popup-poll') {
    const [opened] = sampleNotifications();
    return (
      <View style={styles.screen}>
        <PollPopup
          visible
          title={pollPopupTitle({ type: 'REGION', closesAt: '2026-10-28T12:00:00Z' })}
          message={notificationTitle(opened)}
          deadline={deadlineLine('2026-10-28T12:00:00Z')}
          onLater={back}
          onGo={back}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.menu}>
      <Text style={[typography.subBold, styles.heading]}>S48·S49 알림</Text>
      <View style={styles.row}>
        {EXAMPLES.map((e) => (
          <Button
            key={e.state}
            label={e.label}
            size="sm"
            variant="secondary"
            onPress={() => setState(e.state)}
          />
        ))}
      </View>
      <Button label="돌아가기" size="sm" variant="text" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  menu: { padding: layout.screenPaddingX, gap: spacing[12] },
  heading: { color: colors.text.default },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
});
