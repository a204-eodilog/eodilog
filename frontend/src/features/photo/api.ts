import { randomUUID } from 'expo-crypto';
import { apiClient } from '@/api/client';
import { toApiError } from '@/api/errors';
import type { DataResponse, PageResponse, Trip } from '@/api/types';
import { env } from '@/config/env';

import { isBusy } from './photo-rules';
import type {
  CoursePlace,
  PhotoBatch,
  PhotoSummary,
  PhotoTopic,
  PickedPhoto,
  TripPhoto,
  UploadIntent,
} from './types';

/** 머리에 쓸 여행 이름. GET /trips/{tripId} */
export async function getTripTitle(tripId: string): Promise<string> {
  return (await getTrip(tripId)).title;
}

/** 여행(이름·시작일·동행). 올린 사람 얼굴과 일차 계산에 쓴다 */
export async function getTrip(tripId: string): Promise<Trip> {
  const { data } = await apiClient.get<DataResponse<Trip>>(`/trips/${encodeURIComponent(tripId)}`);
  return data.data;
}

/** 서버 최대 페이지 크기. 한 여행 사진은 끝까지 읽는다 */
const PAGE_LIMIT = 100;

/** 여행 사진 전부(올린 최신순). 지운 사진은 서버가 뺀다 */
export async function getTripPhotos(tripId: string): Promise<TripPhoto[]> {
  const all: TripPhoto[] = [];
  let cursor: string | null = null;
  do {
    const { data }: { data: PageResponse<TripPhoto> } = await apiClient.get(
      `/trips/${encodeURIComponent(tripId)}/photos`,
      { params: { limit: PAGE_LIMIT, ...(cursor ? { cursor } : {}) } },
    );
    all.push(...data.data);
    cursor = data.page.hasNext ? data.page.nextCursor : null;
  } while (cursor);
  return all;
}

/** 주제별·장소별·장소 미지정 수 */
export async function getPhotoSummary(tripId: string): Promise<PhotoSummary> {
  const { data } = await apiClient.get<DataResponse<PhotoSummary>>(
    `/trips/${encodeURIComponent(tripId)}/photo-summary`,
  );
  return data.data;
}

/** 여행 코스 장소(장소 이름·일차) */
export async function getCoursePlaces(tripId: string): Promise<CoursePlace[]> {
  const { data } = await apiClient.get<DataResponse<{ items: CoursePlace[] }>>(
    `/trips/${encodeURIComponent(tripId)}/itinerary`,
  );
  return data.data.items;
}

/** 코스에 없는 장소의 이름. GET /places/{placeId} */
export async function getPlaceName(placeId: string): Promise<string> {
  const { data } = await apiClient.get<DataResponse<{ id: string; name: string }>>(
    `/places/${encodeURIComponent(placeId)}`,
  );
  return data.data.name;
}

/** 사진을 장소에 연결(올린 사람만). 버전이 다르면 409 VERSION_CONFLICT */
export async function updatePhotoPlace(
  tripId: string,
  photo: Pick<TripPhoto, 'id' | 'version'>,
  placeId: string | null,
): Promise<TripPhoto> {
  return updatePhoto(tripId, photo, { placeId });
}

/**
 * 사진 수동 보정(올린 사람만). 보내지 않은 값은 그대로, placeId null은 장소 해제, topics []는 주제 해제.
 * 버전이 다르면 409 VERSION_CONFLICT
 */
export async function updatePhoto(
  tripId: string,
  photo: Pick<TripPhoto, 'id' | 'version'>,
  change: { placeId?: string | null; topics?: PhotoTopic[] },
): Promise<TripPhoto> {
  const { data } = await apiClient.patch<DataResponse<TripPhoto>>(
    `/trips/${encodeURIComponent(tripId)}/photos/${encodeURIComponent(photo.id)}`,
    { expectedVersion: photo.version, ...change },
  );
  return data.data;
}

/**
 * 여러 장을 한 번에 수동 보정(`POST /trips/{tripId}/photos/batch`, action UPDATE, 올린 사람만, 1~50장).
 * 한 장이라도 실패하면 아무것도 바뀌지 않는다. 버전이 하나라도 다르면 409 VERSION_CONFLICT
 */
export async function batchUpdatePhotos(
  tripId: string,
  photos: readonly Pick<TripPhoto, 'id' | 'version'>[],
  change: { placeId?: string | null; topics?: PhotoTopic[] },
): Promise<TripPhoto[]> {
  const { data } = await apiClient.post<
    DataResponse<{ photos: TripPhoto[]; deletedPhotoIds: string[] }>
  >(`/trips/${encodeURIComponent(tripId)}/photos/batch`, {
    action: 'UPDATE',
    photos: photos.map((p) => ({ photoId: p.id, expectedVersion: p.version })),
    ...change,
  });
  return data.data.photos;
}

/** 사진 지우기(올린 사람만). 서버는 바로 목록에서 빼고 파일은 나중에 정리한다(202 작업) */
export async function deletePhoto(tripId: string, photoId: string): Promise<void> {
  await apiClient.delete(
    `/trips/${encodeURIComponent(tripId)}/photos/${encodeURIComponent(photoId)}`,
  );
}

/** 업로드 배치. 같은 고르기의 재요청은 같은 Idempotency-Key로 보내 배치가 두 번 생기지 않는다 */
export async function createPhotoBatch(
  tripId: string,
  fileCount: number,
  idempotencyKey: string,
): Promise<PhotoBatch> {
  const { data } = await apiClient.post<DataResponse<PhotoBatch>>(
    `/trips/${encodeURIComponent(tripId)}/photo-upload-batches`,
    { fileCount },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return data.data;
}

/**
 * 사진 바이트. 선택창이 크기를 주지 않아도 실제 크기를 알 수 있게 먼저 읽는다.
 * Blob이 아니라 ArrayBuffer로 읽는다: 안드로이드에서 Blob을 바디로 넘기면 바이트가 그대로 가지 않아
 * 서명(content-type·content-length 포함)이 맞지 않고 저장소가 403으로 거부한다(!196 실기기 확인)
 */
export async function readPhoto(uri: string): Promise<ArrayBuffer> {
  return (await fetch(uri)).arrayBuffer();
}

/** 파일 자리 받기(TRIP_PHOTO는 tripId·batchId 필수) */
export async function requestUploadIntent(input: {
  tripId: string;
  batchId: string;
  contentType: string;
  byteSize: number;
}): Promise<UploadIntent> {
  const { data } = await apiClient.post<DataResponse<UploadIntent>>('/assets/upload-intents', {
    purpose: 'TRIP_PHOTO',
    ...input,
  });
  return data.data;
}

/**
 * 받은 서명 주소로 바이트를 보낸다. API 인증 헤더는 붙이지 않고 응답 headers를 그대로 쓰되,
 * content-length는 런타임이 바디 크기로 정하게 뺀다(백엔드 사용 순서 3). 테스트 모드면 보내지 않는다
 */
export async function putPhoto(intent: UploadIntent, body: ArrayBuffer, signal?: AbortSignal) {
  if (env.devMock) return;
  const headers = Object.fromEntries(
    Object.entries(intent.headers).filter(([name]) => name.toLowerCase() !== 'content-length'),
  );
  const res = await fetch(intent.uploadUrl, { method: intent.method, headers, body, signal });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
}

const BUSY_RETRIES = 5;
const BUSY_WAIT_MS = 800;

/**
 * 업로드 완료 확인. 서버는 완료 처리를 한 번에 한 건만 해서 다른 사진을 처리 중이면 503을 준다.
 * 그때는 조금 기다렸다 다시 보낸다(최대 5번)
 */
export async function completeAsset(assetId: string, signal?: AbortSignal): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await apiClient.post(`/assets/${encodeURIComponent(assetId)}/complete`, undefined, {
        signal,
      });
      return;
    } catch (e) {
      if (signal?.aborted || attempt >= BUSY_RETRIES || !isBusy(toApiError(e).status)) throw e;
      await new Promise((resolve) => setTimeout(resolve, BUSY_WAIT_MS * (attempt + 1)));
    }
  }
}

/** 아직 완료하지 않은 파일 지우기(올리기 취소). 실패해도 서버가 기한 뒤 정리한다 */
export async function cancelAsset(assetId: string): Promise<void> {
  await apiClient.delete(`/assets/${encodeURIComponent(assetId)}`);
}

/** 완료된 파일을 여행 사진으로 등록. 같은 asset·같은 본문 재요청은 같은 결과를 준다 */
export async function registerPhoto(
  tripId: string,
  input: { batchId: string; assetId: string; capturedAt: PickedPhoto['capturedAt'] },
): Promise<TripPhoto> {
  const { data } = await apiClient.post<DataResponse<TripPhoto>>(
    `/trips/${encodeURIComponent(tripId)}/photos`,
    {
      batchId: input.batchId,
      assetId: input.assetId,
      ...(input.capturedAt ? { capturedAt: input.capturedAt } : {}),
    },
  );
  return data.data;
}

/** 폰 AI가 정한 사진 한 장의 주제·비슷한 사진 묶음 키 */
export type DevicePhotoResult = {
  photoId: string;
  expectedVersion: number;
  topic: PhotoTopic;
  /** 이 요청 안에서 같은 키를 가진 사진끼리 비슷한 사진. 혼자면 null */
  groupKey: string | null;
};

/**
 * 폰 AI 분류 결과 적용(내가 올린 사진만, 1~50장). 사진은 보내지 않고 결과만 보낸다.
 * 서버가 버전을 확인하고(다르면 409 VERSION_CONFLICT), 직접 고친 주제는 덮어쓰지 않는다.
 * AI 사진 분류를 끈 사용자는 409 AI_FEATURE_DISABLED
 */
export async function applyDeviceClassification(
  tripId: string,
  photos: DevicePhotoResult[],
): Promise<TripPhoto[]> {
  const { data } = await apiClient.post<DataResponse<{ photos: TripPhoto[] }>>(
    `/trips/${encodeURIComponent(tripId)}/photo-classifications/device`,
    { photos },
  );
  return data.data.photos;
}

/** POST /trips/{tripId}/photo-classifications(1~50장). 작업 ID를 준다. AI 기능이 꺼져 있으면 409 */
export async function requestPhotoClassification(
  tripId: string,
  photoIds: string[],
): Promise<string> {
  const { data } = await apiClient.post<DataResponse<{ jobId: string }>>(
    `/trips/${encodeURIComponent(tripId)}/photo-classifications`,
    { photoIds },
    { headers: { 'Idempotency-Key': randomUUID() } },
  );
  return data.data.jobId;
}

/** GET /jobs/{jobId}. 사진 분류 결과는 result.photos[{photoId,status}] */
export async function getClassificationJob(jobId: string): Promise<{
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  result: { photos?: { photoId: string; status: string }[] } | null;
}> {
  const { data } = await apiClient.get<
    DataResponse<{
      status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
      result: { photos?: { photoId: string; status: string }[] } | null;
    }>
  >(`/jobs/${encodeURIComponent(jobId)}`);
  return data.data;
}

/** POST /trips/{tripId}/photo-classifications/{jobId}/apply. 요청 때의 사진 version이 같아야 적용된다 */
export async function applyPhotoClassification(
  tripId: string,
  jobId: string,
  expectedPhotoVersions: { photoId: string; version: number }[],
): Promise<void> {
  await apiClient.post(
    `/trips/${encodeURIComponent(tripId)}/photo-classifications/${encodeURIComponent(jobId)}/apply`,
    { expectedPhotoVersions },
  );
}
