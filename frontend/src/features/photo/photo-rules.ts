import type { PhotoTopic, PickedPhoto, TripPhoto, UploadItem } from './types';

/** 한 번에 올릴 수 있는 사진 수(결정 Q-7, 백엔드 배치 fileCount 1~50) */
export const MAX_PHOTOS = 50;

/** 사진 한 장 최대 크기(백엔드 STORAGE_MAX_BYTES 기본 15MiB) */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

/**
 * 사진을 고를 때 다시 압축하는 품질(0~1). 크기(4000×3000)는 그대로 두고 용량만 줄인다.
 * 같은 사진 10장을 폰에서 재 보니 1.0은 30.0MB, 0.8은 17.8MB, 0.7은 8.7MB였고,
 * 원본과의 화질 차이(PSNR)는 0.8이 32.5dB, 0.7이 32.1dB로 거의 같아 0.7로 정했다.
 * 안드로이드는 다시 압축해도 촬영 시각·위치(EXIF)를 새 파일에 옮겨 적는다(서버가 파일에서 읽는다).
 * 선택창이 주는 fileSize는 압축 전 원본 크기라서, 실제 보낼 크기는 파일을 읽어야 알 수 있다
 */
export const PHOTO_PICK_QUALITY = 0.7;

/** 여행 사진으로 받는 형식(명세 §7: JPG/PNG/HEIC) */
const ACCEPTED: Record<string, string> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/heic': 'image/heic',
  'image/heif': 'image/heic',
};

const BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heic',
};

/** 선택창이 준 형식(없으면 파일 이름 끝)을 서버가 받는 형식으로. 받지 않는 형식이면 null */
export function photoContentType(
  mimeType: string | null | undefined,
  fileName: string | null | undefined,
): string | null {
  const mime = mimeType?.toLowerCase().trim();
  if (mime) return ACCEPTED[mime] ?? null;
  const ext = fileName?.split('.').pop()?.toLowerCase();
  return ext ? (BY_EXTENSION[ext] ?? null) : null;
}

/**
 * EXIF 촬영 시각("2026:11:14 10:05:00", 기기 시간대) → UTC ISO.
 * OffsetTimeOriginal("+09:00")이 있으면 그 시간대로, 없으면 기기 시간대로 읽는다. 읽을 수 없으면 null
 */
export function exifCapturedAt(exif: Record<string, unknown> | null | undefined): string | null {
  const raw = exif?.DateTimeOriginal ?? exif?.DateTime;
  if (typeof raw !== 'string') return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const offset = exif?.OffsetTimeOriginal ?? exif?.OffsetTime;
  const date =
    typeof offset === 'string' && /^[+-]\d{2}:\d{2}$/.test(offset)
      ? new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${offset}`)
      : new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  return Number.isNaN(date.getTime()) || Number(y) < 1990 ? null : date.toISOString();
}

/** 선택창이 돌려준 사진 한 장(expo-image-picker의 asset에서 쓰는 값만) */
export type PickerAsset = {
  assetId?: string | null;
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  exif?: Record<string, unknown> | null;
};

/** 빠진 사진 수(이유별). 화면이 토스트로 알린다 */
export type SkippedPhotos = { type: number; size: number; over: number };

/**
 * 선택창에서 고른 사진을 지금 고른 목록에 더한다. 이미 고른 사진은 다시 넣지 않고,
 * 받지 않는 형식·15MB 초과·50장을 넘는 사진은 빼고 그 수를 돌려준다
 */
export function addPickedPhotos(
  current: readonly PickedPhoto[],
  assets: readonly PickerAsset[],
): { photos: PickedPhoto[]; skipped: SkippedPhotos } {
  const photos = [...current];
  const keys = new Set(current.map((p) => p.key));
  const skipped: SkippedPhotos = { type: 0, size: 0, over: 0 };
  for (const a of assets) {
    const key = a.assetId || a.uri;
    if (keys.has(key)) continue;
    const contentType = photoContentType(a.mimeType, a.fileName);
    if (!contentType) {
      skipped.type += 1;
      continue;
    }
    // 크기를 모르면 서버가 확인한다(1바이트 이상이어야 해서 0은 보내지 않는다)
    const byteSize = a.fileSize ?? 0;
    if (byteSize > MAX_PHOTO_BYTES) {
      skipped.size += 1;
      continue;
    }
    if (photos.length >= MAX_PHOTOS) {
      skipped.over += 1;
      continue;
    }
    keys.add(key);
    photos.push({ key, uri: a.uri, contentType, byteSize, capturedAt: exifCapturedAt(a.exif) });
  }
  return { photos, skipped };
}

/** 빠진 사진 안내 글. 빠진 것이 없으면 null */
export function skippedMessage(skipped: SkippedPhotos): string | null {
  if (skipped.over > 0) return `한 번에 ${MAX_PHOTOS}장까지 올릴 수 있어요`;
  if (skipped.type > 0) return `JPG·PNG·HEIC 사진만 올릴 수 있어요 (${skipped.type}장 뺐어요)`;
  if (skipped.size > 0) return `15MB가 넘는 사진은 올릴 수 없어요 (${skipped.size}장 뺐어요)`;
  return null;
}

/** 업로드 진행 숫자 */
export function uploadCounts(items: readonly UploadItem[]) {
  let done = 0;
  let failed = 0;
  for (const item of items) {
    if (item.status === 'done') done += 1;
    else if (item.status === 'failed') failed += 1;
  }
  return { total: items.length, done, failed };
}

/** 같은 응답을 다시 받아도 되는(잠깐 막힌) 오류인지. 완료 처리는 서버 한 대에 한 건씩이라 503이 올 수 있다 */
export function isBusy(status: number | null | undefined): boolean {
  return status === 503 || status === 429;
}

/** 일괄 변경 API(`POST /trips/{tripId}/photos/batch`) 한 번에 보낼 수 있는 최대 장수 */
export const PHOTO_BATCH_MAX = 50;

/** 목록을 size개씩 나눈다(마지막 묶음은 더 적을 수 있다). 일괄 변경을 50장씩 보낼 때 쓴다 */
export function inBatches<T>(items: readonly T[], size: number = PHOTO_BATCH_MAX): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** 성공한 사진만 적용한다. 적용할 때는 분류를 요청할 때의 사진 version을 보낸다 */
export function successfulVersions(
  result: { photos?: { photoId: string; status: string }[] } | null,
  versions: ReadonlyMap<string, number>,
): { photoId: string; version: number }[] {
  return (result?.photos ?? [])
    .filter((p) => p.status === 'SUCCEEDED' && versions.has(p.photoId))
    .map((p) => ({ photoId: p.photoId, version: versions.get(p.photoId)! }));
}

/** 폰 AI가 낸 한 장의 결과(주제·비슷한 사진 묶음 키) */
export type DeviceTopicResult = { topic: PhotoTopic; groupKey: string | null };

/**
 * 등록을 마친 사진을 폰 결과로 저장할 것과 서버 AI 분류에 보낼 것으로 나눈다.
 * 같은 사진을 두 곳에서 분류하면 먼저 적용된 쪽이 version을 올려 다른 쪽이 409로 실패한다
 */
export function splitClassification(
  registered: readonly { key: string; photo: TripPhoto }[],
  resultFor: (key: string) => DeviceTopicResult | null = () => null,
): {
  device: {
    photoId: string;
    expectedVersion: number;
    topic: PhotoTopic;
    groupKey: string | null;
  }[];
  server: TripPhoto[];
} {
  const device: {
    photoId: string;
    expectedVersion: number;
    topic: PhotoTopic;
    groupKey: string | null;
  }[] = [];
  const server: TripPhoto[] = [];
  for (const r of registered) {
    const result = resultFor(r.key);
    if (result) device.push({ photoId: r.photo.id, expectedVersion: r.photo.version, ...result });
    else server.push(r.photo);
  }
  return { device, server };
}
