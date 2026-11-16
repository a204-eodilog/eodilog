import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CenterNotice } from '@/components/ui';
import { SkeletonList } from '@/components/ui/skeleton';
import { colors } from '@/theme';

import { pickPlace } from '@/features/place';

import { PlaceSaveSheet } from '../components/place-save-sheet';
import { SavedView } from '../components/saved-view';
import { GroupTripSheet } from '../components/group-trip-sheet';
import { useBookmarks, useOnline, useSavedView } from '../hooks/use-bookmarks';
import { useTripOptions } from '../hooks/use-trip-options';
import { toSavedItem } from '../saved-rules';

/**
 * S10 개인 즐겨찾기. 저장 탭 첫 화면.
 * 카드·핀은 S14 저장 장소 상세, [+]는 S11 링크·캡처 등록으로 간다. [그룹]은 여행을 고르는 시트를 열고, 고른 여행의 S20 그룹 즐겨찾기(C)로 간다
 */
export function SavedScreen() {
  const insets = useSafeAreaInsets();
  const bookmarks = useBookmarks();
  const online = useOnline();
  const [view, setView] = useSavedView();
  const [groupOpen, setGroupOpen] = useState(false);
  // 장소 이름으로 찾아 고른 곳과 저장 위치(개인·그룹) 시트. 닫을 때는 시트만 내린다.
  // 고른 곳까지 비우면 시트가 내려가는 동안 제목이 "장소 0곳"으로 바뀌었다(!308 리뷰)
  const [found, setFound] = useState<{ id: string; name: string } | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const search = async () => {
    const place = await pickPlace();
    if (!place) return;
    setFound({ id: place.id, name: place.name });
    setSaveOpen(true);
  };
  // 그룹 시트를 열 때만 내 여행을 읽는다
  const trips = useTripOptions(groupOpen);

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
          <SkeletonList style={styles.loading} />
        )}
      </View>
    );
  }

  return (
    <>
      <SavedView
        items={bookmarks.data.map(toSavedItem)}
        view={view}
        onView={setView}
        // 연결이 끊겼으면 마지막으로 받아 온 목록을 그대로 두고 기준 시각을 알린다
        offline={!online}
        onGroup={() => setGroupOpen(true)}
        onOpen={(item) => router.push({ pathname: '/saved/[key]', params: { key: item.key } })}
        onAdd={(start) =>
          router.push(start ? { pathname: '/saved/add', params: { start } } : '/saved/add')
        }
        onSearch={() => void search()}
      />
      <PlaceSaveSheet
        visible={saveOpen && found !== null}
        places={found ? [found] : []}
        initialChoice="personal"
        // 이미 저장 탭이라 완료 안내에 [보기]를 붙이지 않는다
        opensSavedTab
        onClose={() => setSaveOpen(false)}
        onSaved={(target) => {
          setSaveOpen(false);
          if (target.kind === 'trip') {
            // S12에서 그룹에 담을 때처럼 여행 상세를 먼저 열고 S20을 올린다. 뒤로 가면 여행 상세로 간다(!308 리뷰)
            router.push({ pathname: '/trips/[tripId]', params: { tripId: target.tripId } });
            router.push({
              pathname: '/trips/[tripId]/favorites',
              params: { tripId: target.tripId },
            });
          }
        }}
      />
      <GroupTripSheet
        visible={groupOpen}
        trips={trips.trips}
        tripsStatus={trips.status}
        onRetryTrips={trips.retry}
        onClose={() => setGroupOpen(false)}
        onPick={(tripId) => {
          setGroupOpen(false);
          router.push({ pathname: '/trips/[tripId]/favorites', params: { tripId } });
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  loading: { flex: 1 },
});
