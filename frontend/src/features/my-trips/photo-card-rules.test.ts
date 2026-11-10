import { describe, expect, it } from '@jest/globals';

import type { TripPhoto } from '@/features/photo';

import { photoCardInfo } from './photo-card-rules';

function photo(n: number, uploaderMemberId: string): TripPhoto {
  return {
    id: `p${n}`,
    assetId: `a${n}`,
    tripId: 't',
    batchId: null,
    uploaderMemberId,
    placeId: null,
    capturedAt: null,
    topics: [],
    groupId: null,
    version: 1,
  };
}

describe('photoCardInfo', () => {
  it('못 읽었으면 머리 줄만', () => {
    expect(photoCardInfo(undefined)).toEqual({ title: '사진', sub: null, thumbAssetIds: [] });
  });

  it('사진이 없으면 안내 줄', () => {
    expect(photoCardInfo([])).toEqual({
      title: '사진',
      sub: '아직 올린 사진이 없어요',
      thumbAssetIds: [],
    });
  });

  it('장수, 올린 사람 수(중복 없이), 앞 4장 썸네일', () => {
    const photos = [photo(1, 'm1'), photo(2, 'm2'), photo(3, 'm1'), photo(4, 'm3'), photo(5, 'm2')];
    expect(photoCardInfo(photos)).toEqual({
      title: '사진 5장',
      sub: '3명이 올렸어요',
      thumbAssetIds: ['a1', 'a2', 'a3', 'a4'],
    });
  });

  it('4장보다 적으면 있는 만큼', () => {
    expect(photoCardInfo([photo(1, 'm1'), photo(2, 'm1')]).thumbAssetIds).toEqual(['a1', 'a2']);
  });
});
