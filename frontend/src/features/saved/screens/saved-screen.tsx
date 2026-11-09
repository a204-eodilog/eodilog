import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CenterNotice, toast } from '@/components/ui';
import { colors } from '@/theme';

import { SavedView } from '../components/saved-view';
import { useBookmarks, useOnline, useSavedView } from '../hooks/use-bookmarks';
import { syncedAtLabel, toSavedItem } from '../saved-rules';

const notReady = () => toast.show('준비 중이에요');

/**
 * S10 개인 즐겨찾기. 저장 탭 첫 화면.
 * 카드·핀은 S14 저장 장소 상세, [+]는 S11 링크·캡처 등록으로 간다. S20 그룹 즐겨찾기(C)는 아직 없어 준비 중 안내를 띄운다
 */
export function SavedScreen() {
  const insets = useSafeAreaInsets();
  const bookmarks = useBookmarks();
  const online = useOnline();
  const [view, setView] = useSavedView();

  if (!bookmarks.data) {
    // 받아 둔 목록 없이 연결이 끊기면 조회가 멈춘(paused) 채 isError가 되지 않아 로딩만 돈다.
    // 연결 안내를 보여 주고, 연결이 돌아오면 TanStack Query가 멈춘 조회를 자동으로 다시 보낸다
    const offline = !online || bookmarks.fetchStatus === 'paused';
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        {offline ? (
          <CenterNotice
            icon="wifi-off"
            title="인터넷에 연결되지 않았어요"
            description="연결되면 저장한 장소를 자동으로 불러와요"
            actionLabel="다시 시도"
            actionIcon="refresh"
            onAction={() => void bookmarks.refetch()}
          />
        ) : bookmarks.isError ? (
          <CenterNotice
            icon="alert"
            title="저장한 장소를 불러오지 못했어요"
            description="다시 시도해 주세요"
            actionLabel="다시 시도"
            actionIcon="refresh"
            onAction={() => void bookmarks.refetch()}
          />
        ) : (
          <ActivityIndicator style={styles.loading} color={colors.brand.primary} />
        )}
      </View>
    );
  }

  return (
    <SavedView
      items={bookmarks.data.map(toSavedItem)}
      view={view}
      onView={setView}
      // 연결이 끊겼으면 마지막으로 받아 온 목록을 그대로 두고 기준 시각을 알린다
      offlineSince={online ? null : syncedAtLabel(bookmarks.dataUpdatedAt)}
      onGroup={notReady}
      onOpen={(item) => router.push({ pathname: '/saved/[key]', params: { key: item.key } })}
      onAdd={() => router.push('/saved/add')}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  loading: { flex: 1 },
});
