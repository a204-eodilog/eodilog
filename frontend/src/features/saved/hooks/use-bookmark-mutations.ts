import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';

import { toast } from '@/components/ui';

import { addToTrip, deleteBookmark, putBookmark, updateBookmarkMemo } from '../api';
import type { Bookmark } from '../types';

import { bookmarkKeys } from './use-bookmarks';

const samePlace = (a: Bookmark, placeId: string) => a.place?.id === placeId;

/** 메모 고치기. 응답을 바로 목록에 넣어 S14·S10이 함께 바뀐다 */
export function useUpdateMemo(placeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memo: string) => updateBookmarkMemo(placeId, memo),
    onSuccess: async (bookmark) => {
      queryClient.setQueryData<Bookmark[]>(bookmarkKeys.all, (old) =>
        old?.map((b) => (samePlace(b, placeId) ? bookmark : b)),
      );
      await queryClient.invalidateQueries({ queryKey: bookmarkKeys.all });
    },
  });
}

/** 저장 해제. 목록에서 바로 빼고, 실패하면 다시 읽는다 */
export function useDeleteBookmark(placeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteBookmark(placeId),
    onSuccess: () => {
      queryClient.setQueryData<Bookmark[]>(bookmarkKeys.all, (old) =>
        old?.filter((b) => !samePlace(b, placeId)),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: bookmarkKeys.all }),
  });
}

/** 해제 되돌리기. 지운 즐겨찾기의 메모·원본 피드로 다시 저장한다 */
/**
 * 해제 되돌리기(토스트 [되돌리기]). S14가 닫힌 뒤 S10에서 눌리므로 화면에 묶인 mutate 콜백 대신
 * 그냥 함수로 두고 실패 토스트·[다시 시도]도 여기서 띄운다(화면이 사라지면 mutate 콜백은 불리지 않는다).
 * 서버가 PUT의 sourceFeedId를 받지 않아(400) 메모만 다시 보낸다. 공동 피드에서 담은 즐겨찾기는 되돌리면
 * 원본 피드 연결이 빠진다(백엔드 후속)
 */
export function restoreBookmark(queryClient: QueryClient, bookmark: Bookmark): void {
  const placeId = bookmark.place?.id;
  if (!placeId) return;
  putBookmark(placeId, bookmark.memo ? { memo: bookmark.memo } : {})
    .then(() => toast.show('다시 저장했어요'))
    .catch(() =>
      toast.error('되돌리지 못했어요', {
        action: { label: '다시 시도', onPress: () => restoreBookmark(queryClient, bookmark) },
      }),
    )
    .finally(() => void queryClient.invalidateQueries({ queryKey: bookmarkKeys.all }));
}

/** 그룹 즐겨찾기에 추가. 그 여행의 저장 장소 목록(S20)은 C 화면이 읽는다 */
export function useAddToTrip(placeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tripId: string) => addToTrip(tripId, placeId),
    onSuccess: (_data, tripId) =>
      queryClient.invalidateQueries({ queryKey: ['trips', tripId, 'saved-places'] }),
  });
}
