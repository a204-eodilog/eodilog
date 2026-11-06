import { apiClient } from '@/api/client';
import type { DataResponse, PageResponse } from '@/api/types';

import type { Bookmark } from './types';

/** 서버 최대 페이지 크기. 지도에 모두 올려야 해서 끝까지 읽는다 */
const PAGE_LIMIT = 100;

/** 내 개인 즐겨찾기 전부. 최근 저장한 순 */
export async function getAllBookmarks(): Promise<Bookmark[]> {
  const all: Bookmark[] = [];
  let cursor: string | null = null;
  do {
    const { data }: { data: PageResponse<Bookmark> } = await apiClient.get('/me/bookmarks', {
      params: { limit: PAGE_LIMIT, ...(cursor ? { cursor } : {}) },
    });
    all.push(...data.data);
    cursor = data.page.hasNext ? data.page.nextCursor : null;
  } while (cursor);
  return all;
}

/** 메모 고치기. 장소 원본이 아니라 내 즐겨찾기 메모만 바뀐다 */
export async function updateBookmarkMemo(placeId: string, memo: string): Promise<Bookmark> {
  const { data } = await apiClient.patch<DataResponse<Bookmark>>(`/me/bookmarks/${placeId}`, {
    memo,
  });
  return data.data;
}

/** 저장 해제. 그룹 즐겨찾기에 담은 것은 그대로 남는다 */
export async function deleteBookmark(placeId: string): Promise<void> {
  await apiClient.delete(`/me/bookmarks/${placeId}`);
}

/** 저장(사용자·장소당 하나). 해제를 되돌릴 때 메모·원본 피드를 그대로 다시 보낸다 */
export async function putBookmark(
  placeId: string,
  input: { memo?: string; sourceFeedId?: string },
): Promise<Bookmark> {
  const { data } = await apiClient.put<DataResponse<Bookmark>>(`/me/bookmarks/${placeId}`, input);
  return data.data;
}

/** 여행 그룹 즐겨찾기에 내 저장으로 담기. 개인 보관함 전체를 복사하지 않고 이 장소 하나만 */
export async function addToTrip(tripId: string, placeId: string): Promise<void> {
  await apiClient.put(`/trips/${tripId}/saved-places/${placeId}/me`, {});
}
