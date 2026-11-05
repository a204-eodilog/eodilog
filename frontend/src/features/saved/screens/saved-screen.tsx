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
 * 카드·핀은 S14 저장 장소 상세로 간다. S11 링크·캡처 등록, S20 그룹 즐겨찾기(C)는 아직 없어 준비 중 안내를 띄운다
 */
export function SavedScreen() {
  const insets = useSafeAreaInsets();
  const bookmarks = useBookmarks();
  const online = useOnline();
  const [view, setView] = useSavedView();

  if (!bookmarks.data) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        {bookmarks.isError ? (
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
      onAdd={notReady}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  loading: { flex: 1 },
});
