import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';

import { CenterNotice, Header, toast } from '@/components/ui';
import { colors } from '@/theme';

import { AddToTripSheet } from '../components/add-to-trip-sheet';
import { MemoSheet } from '../components/memo-sheet';
import { SavedPlaceView } from '../components/saved-place-view';
import {
  useAddToTrip,
  restoreBookmark,
  useDeleteBookmark,
  useUpdateMemo,
} from '../hooks/use-bookmark-mutations';
import { useBookmarks } from '../hooks/use-bookmarks';
import { useTripOptions } from '../hooks/use-trip-options';
import { bookmarkSource, findBookmark, toSavedItem } from '../saved-rules';

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/saved'));

/**
 * S14 저장 장소 상세. S10 카드·핀에서 연다(/saved/{key}).
 * 즐겨찾기 하나를 읽는 API가 없어 목록에서 찾는다. 장소가 사라진 즐겨찾기는 장소 id가 없어
 * 메모 고치기·저장 해제·그룹에 추가를 할 수 없다(API가 장소 id로만 받는다. 백엔드에 식별자 요청 필요)
 */
export function SavedPlaceScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const bookmarks = useBookmarks();
  const bookmark = bookmarks.data ? findBookmark(bookmarks.data, key) : null;
  const placeId = bookmark?.place?.id ?? '';

  const update = useUpdateMemo(placeId);
  const remove = useDeleteBookmark(placeId);
  const queryClient = useQueryClient();
  const add = useAddToTrip(placeId);

  // 해제 요청을 이미 보냈는지. 빠르게 여러 번 누르면 다시 그리기 전이라 isPending이 아직 false라서 ref로 바로 막는다
  const unsaving = useRef(false);
  const [memoOpen, setMemoOpen] = useState(false);
  // 메모 시트를 열 때마다 바꿔 시트가 지금 메모로 새로 시작하게 한다
  const [memoKey, setMemoKey] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [tripId, setTripId] = useState<string | null>(null);

  // 그룹에 추가 시트를 열 때만 내 여행을 읽는다
  const trips = useTripOptions(addOpen);

  if (!bookmark) {
    return (
      <View style={styles.screen}>
        <Header />
        {bookmarks.isPending ? (
          <Spinner style={styles.loading} color={colors.brand.primary} />
        ) : bookmarks.isError ? (
          <CenterNotice
            icon="alert"
            title="저장한 장소를 불러오지 못했어요"
            description="다시 시도해 주세요"
            actionLabel="다시 시도"
            actionIcon="refresh"
            onAction={() => void bookmarks.refetch()}
            secondaryLabel="돌아가기"
            onSecondary={goBack}
          />
        ) : (
          <CenterNotice
            icon="bookmark"
            title="저장한 장소를 찾지 못했어요"
            description="저장을 해제한 장소예요"
            actionLabel="돌아가기"
            onAction={goBack}
          />
        )}
      </View>
    );
  }

  const item = toSavedItem(bookmark);
  const editable = bookmark.place !== null;

  // 해제 요청이 끝날 때까지 같은 항목의 다른 변경(다시 해제·메모 고치기·그룹에 추가)을 막는다
  const busy = remove.isPending;

  const onUnsave = () => {
    if (unsaving.current) return;
    unsaving.current = true;
    remove.mutate(undefined, {
      onSuccess: () => {
        goBack();
        toast.show('저장을 해제했어요', {
          action: { label: '되돌리기', onPress: () => restoreBookmark(queryClient, bookmark) },
        });
      },
      onError: () => {
        unsaving.current = false;
        toast.error('저장을 해제하지 못했어요. 다시 시도해 주세요');
      },
    });
  };

  return (
    <>
      <SavedPlaceView
        name={item.name}
        area={item.area}
        latitude={item.latitude}
        longitude={item.longitude}
        memo={bookmark.memo}
        source={bookmarkSource(bookmark)}
        editable={editable}
        busy={busy}
        onUnsave={onUnsave}
        onEditMemo={() => {
          setMemoKey((k) => k + 1);
          setMemoOpen(true);
        }}
        // S07 친구 여행 상세(A)는 아직 없다
        onOpenSource={() => toast.show('준비 중이에요')}
        onAddToTrip={() => {
          setTripId(null);
          setAddOpen(true);
        }}
      />
      <MemoSheet
        key={memoKey}
        visible={memoOpen}
        memo={bookmark.memo ?? ''}
        saving={update.isPending}
        onClose={() => setMemoOpen(false)}
        onSave={(memo) =>
          update.mutate(memo, {
            onSuccess: () => {
              setMemoOpen(false);
              toast.show('메모를 저장했어요');
            },
            onError: () => toast.error('메모를 저장하지 못했어요. 다시 시도해 주세요'),
          })
        }
      />
      <AddToTripSheet
        visible={addOpen}
        placeName={item.name}
        trips={trips.trips}
        tripsStatus={trips.status}
        onRetryTrips={trips.retry}
        selectedId={tripId}
        onSelect={setTripId}
        adding={add.isPending}
        onClose={() => setAddOpen(false)}
        onAdd={() => {
          const trip = trips.trips.find((t) => t.id === tripId);
          if (!trip) return;
          add.mutate(trip.id, {
            onSuccess: () => {
              setAddOpen(false);
              // 값 문서의 [보기](→ S20 그룹 즐겨찾기, C)는 화면이 생기면 붙인다
              toast.show(`${trip.title}에 담았어요`);
            },
            onError: () => toast.error('여행에 담지 못했어요. 다시 시도해 주세요'),
          });
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  loading: { flex: 1 },
});
