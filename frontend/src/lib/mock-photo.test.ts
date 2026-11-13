import { describe, expect, it } from '@jest/globals';

import { mockPhotoSource, rememberMockUpload, sampleIndex } from './mock-photo';

describe('mockPhotoSource', () => {
  it('시험 데이터의 사진은 앱 안의 샘플 그림으로 바꾼다', () => {
    const source = mockPhotoSource('/assets/sample-profile-user-2/download');
    expect(source).not.toBeNull();
    // 인터넷 주소를 쓰지 않는다. 샘플 사진 사이트가 멈췄을 때 사진 칸이 전부 비었다
    expect(JSON.stringify(source)).not.toContain('http');
  });

  it('같은 사진은 늘 같은 그림이다', () => {
    expect(mockPhotoSource('/assets/asset-seed-3/download')).toBe(
      mockPhotoSource('/api/v1/assets/asset-seed-3/download'),
    );
  });

  it('기억해 둔 것이 없는 사진은 바꾸지 않는다', () => {
    expect(mockPhotoSource('/assets/asset-99/download')).toBeNull();
  });

  it('테스트 모드에서 방금 올린 사진은 고른 사진 주소를 그대로 준다', () => {
    rememberMockUpload('asset-7', 'file:///cache/picked.jpg');
    expect(mockPhotoSource('/assets/asset-7/download')).toEqual({
      uri: 'file:///cache/picked.jpg',
    });
    // 여행 사진 목록은 /api/v1을 붙인 주소로 그린다
    expect(mockPhotoSource('/api/v1/assets/asset-7/download')).toEqual({
      uri: 'file:///cache/picked.jpg',
    });
  });
});

describe('sampleIndex', () => {
  it('같은 id는 같은 번호, 범위 안의 번호를 준다', () => {
    expect(sampleIndex('asset-seed-1', 8)).toBe(sampleIndex('asset-seed-1', 8));
    for (const id of ['sample-a', 'asset-seed-12', 'sample-profile-user-2', '']) {
      const n = sampleIndex(id, 8);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(8);
    }
  });

  it('여러 사진이 한 그림에 몰리지 않는다', () => {
    const used = new Set<number>();
    for (let i = 1; i <= 24; i += 1) used.add(sampleIndex(`asset-seed-${i}`, 8));
    expect(used.size).toBeGreaterThanOrEqual(5);
  });
});
