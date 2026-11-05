import { apiClient } from '@/api/client';
import type { PageResponse } from '@/api/types';

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
