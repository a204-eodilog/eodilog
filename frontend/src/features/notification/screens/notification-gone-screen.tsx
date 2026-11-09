import { router, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Header } from '@/components/ui';
import { colors } from '@/theme';

import { NotificationGone } from '../components/notification-states';
import { useDismissNotification } from '../hooks/use-notifications';

/** 목록에서 왔으면 뒤로, 팝업에서 바로 왔으면 목록으로 바꿔 간다 */
function backToList() {
  if (router.canGoBack()) router.back();
  else router.replace('/notifications');
}

/** S49 볼 수 없음 201-26179. 나간 여행이나 지워진 기록의 알림을 눌렀을 때 */
export function NotificationGoneScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const dismiss = useDismissNotification();
  const sending = useRef(false);
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <Header title="알림" largeTitle onBack={backToList} />
      <NotificationGone
        onList={backToList}
        onDismiss={
          id
            ? async () => {
                if (sending.current) return;
                sending.current = true;
                const done = await dismiss(id);
                sending.current = false;
                if (done) backToList();
              }
            : undefined
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
});
