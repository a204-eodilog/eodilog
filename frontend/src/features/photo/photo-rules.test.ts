import { describe, expect, it } from '@jest/globals';

import {
  addPickedPhotos,
  exifCapturedAt,
  inBatches,
  isBusy,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  photoContentType,
  skippedMessage,
  uploadCounts,
  type PickerAsset,
} from './photo-rules';
import type { UploadItem } from './types';

const asset = (id: string, extra: Partial<PickerAsset> = {}): PickerAsset => ({
  assetId: id,
  uri: `file:///photos/${id}.jpg`,
  mimeType: 'image/jpeg',
  fileName: `${id}.jpg`,
  fileSize: 1000,
  ...extra,
});

describe('photoContentType', () => {
  it('JPG·PNG·HEIC만 받고 heif·jpg는 서버 형식으로 맞춘다', () => {
    expect(photoContentType('image/jpeg', null)).toBe('image/jpeg');
    expect(photoContentType('image/JPG', null)).toBe('image/jpeg');
    expect(photoContentType('image/heif', null)).toBe('image/heic');
    expect(photoContentType('image/gif', null)).toBeNull();
    expect(photoContentType('image/webp', 'a.jpg')).toBeNull();
  });

  it('형식이 없으면 파일 이름 끝으로 정한다', () => {
    expect(photoContentType(null, 'IMG_1.HEIC')).toBe('image/heic');
    expect(photoContentType(undefined, 'a.png')).toBe('image/png');
    expect(photoContentType(null, 'noext')).toBeNull();
  });
});

describe('exifCapturedAt', () => {
  it('시간대가 있으면 그 시간대로 UTC를 만든다', () => {
    expect(
      exifCapturedAt({ DateTimeOriginal: '2026:11:14 10:05:00', OffsetTimeOriginal: '+09:00' }),
    ).toBe('2026-11-14T01:05:00.000Z');
  });

  it('시간대가 없으면 기기 시간대로 읽는다', () => {
    expect(exifCapturedAt({ DateTimeOriginal: '2026:11:14 10:05:00' })).toBe(
      new Date(2026, 10, 14, 10, 5, 0).toISOString(),
    );
  });

  it('없거나 읽을 수 없으면 null', () => {
    expect(exifCapturedAt(null)).toBeNull();
    expect(exifCapturedAt({})).toBeNull();
    expect(exifCapturedAt({ DateTimeOriginal: '0000:00:00 00:00:00' })).toBeNull();
    expect(exifCapturedAt({ DateTimeOriginal: 'yesterday' })).toBeNull();
  });
});

describe('addPickedPhotos', () => {
  it('새로 고른 사진을 뒤에 더하고 이미 고른 사진은 다시 넣지 않는다', () => {
    const first = addPickedPhotos([], [asset('a'), asset('b')]).photos;
    const { photos, skipped } = addPickedPhotos(first, [asset('b'), asset('c')]);
    expect(photos.map((p) => p.key)).toEqual(['a', 'b', 'c']);
    expect(skipped).toEqual({ type: 0, size: 0, over: 0 });
  });

  it('받지 않는 형식·15MB 초과·50장 초과는 빼고 센다', () => {
    const many = Array.from({ length: MAX_PHOTOS }, (_, i) => asset(`p${i}`));
    const { photos, skipped } = addPickedPhotos(
      [],
      [
        asset('gif', { mimeType: 'image/gif' }),
        asset('big', { fileSize: MAX_PHOTO_BYTES + 1 }),
        ...many,
        asset('extra'),
      ],
    );
    expect(photos).toHaveLength(MAX_PHOTOS);
    expect(skipped).toEqual({ type: 1, size: 1, over: 1 });
  });

  it('기기 사진 id가 없으면 주소로 구분하고, 크기를 모르면 0으로 둔다', () => {
    const { photos } = addPickedPhotos([], [asset('a', { assetId: null, fileSize: null })]);
    expect(photos[0]).toMatchObject({ key: 'file:///photos/a.jpg', byteSize: 0 });
  });
});

describe('skippedMessage', () => {
  it('50장 초과를 먼저, 없으면 형식, 크기 순으로 알린다', () => {
    expect(skippedMessage({ type: 1, size: 1, over: 2 })).toBe('한 번에 50장까지 올릴 수 있어요');
    expect(skippedMessage({ type: 2, size: 1, over: 0 })).toBe(
      'JPG·PNG·HEIC 사진만 올릴 수 있어요 (2장 뺐어요)',
    );
    expect(skippedMessage({ type: 0, size: 3, over: 0 })).toBe(
      '15MB가 넘는 사진은 올릴 수 없어요 (3장 뺐어요)',
    );
    expect(skippedMessage({ type: 0, size: 0, over: 0 })).toBeNull();
  });
});

describe('uploadCounts / isBusy', () => {
  it('올린 장과 실패한 장을 센다', () => {
    const item = (status: UploadItem['status']): UploadItem => ({
      photo: { key: status, uri: '', contentType: 'image/jpeg', byteSize: 1, capturedAt: null },
      status,
      assetId: null,
      ready: false,
    });
    expect(uploadCounts([item('done'), item('failed'), item('waiting'), item('done')])).toEqual({
      total: 4,
      done: 2,
      failed: 1,
    });
  });

  it('503·429만 잠깐 막힌 것으로 본다', () => {
    expect(isBusy(503)).toBe(true);
    expect(isBusy(429)).toBe(true);
    expect(isBusy(500)).toBe(false);
    expect(isBusy(null)).toBe(false);
  });
});

describe('일괄 변경 나누기', () => {
  it('50장씩 나누고 마지막 묶음은 남은 만큼', () => {
    const ids = Array.from({ length: 101 }, (_, i) => i);
    expect(inBatches(ids).map((b) => b.length)).toEqual([50, 50, 1]);
    expect(inBatches(ids)[1][0]).toBe(50);
  });
  it('비어 있으면 빈 목록', () => {
    expect(inBatches([])).toEqual([]);
  });
});
