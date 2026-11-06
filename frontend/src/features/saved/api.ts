import { apiClient } from '@/api/client';
import type { DataResponse, PageResponse } from '@/api/types';
import { env } from '@/config/env';

import type { Bookmark, ExtractionResult, JobRef, UploadIntent } from './types';

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
export async function addToTrip(tripId: string, placeId: string, memo?: string): Promise<void> {
  await apiClient.put(`/trips/${tripId}/saved-places/${placeId}/me`, memo ? { memo } : {});
}

/** 추출 입력. 링크나 캡처 중 하나 이상 */
export type ExtractionInput = { url?: string; captureAssetIds?: string[]; memo?: string };

/** 캡처 한 장. 기기 사진 고르기에서 받은 값 */
export type CaptureFile = { uri: string; contentType: string; byteSize: number };

/**
 * 캡처 한 장 올리기: 업로드 준비 → 받은 주소로 파일 PUT → 완료 확인. 완료된 자료 id를 돌려준다.
 * 받은 주소(저장소)에는 API 인증 헤더를 보내지 않아 apiClient가 아닌 fetch로 올린다.
 * 개발용 테스트 모드는 저장소가 없어 파일 PUT을 건너뛴다
 */
export async function uploadCapture(file: CaptureFile): Promise<string> {
  const { data } = await apiClient.post<DataResponse<UploadIntent>>('/assets/upload-intents', {
    purpose: 'CAPTURE',
    contentType: file.contentType,
    byteSize: file.byteSize,
  });
  const intent = data.data;
  if (!env.devMock) {
    const blob = await (await fetch(file.uri)).blob();
    const res = await fetch(intent.uploadUrl, {
      method: intent.method,
      headers: intent.headers,
      body: blob,
    });
    if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  }
  await apiClient.post(`/assets/${intent.assetId}/complete`);
  return intent.assetId;
}

/** AI 장소 추출 시작. 작업 id를 돌려준다 */
export async function startExtraction(input: ExtractionInput): Promise<string> {
  const { data } = await apiClient.post<DataResponse<JobRef>>('/extractions', input);
  return data.data.jobId;
}

/** 추출 진행·결과 */
export async function getExtraction(jobId: string): Promise<ExtractionResult> {
  const { data } = await apiClient.get<DataResponse<ExtractionResult>>(`/extractions/${jobId}`);
  return data.data;
}

/** 추출 취소. 입력·후보가 지워진다 */
export async function cancelExtraction(jobId: string): Promise<void> {
  await apiClient.delete(`/extractions/${jobId}`);
}
