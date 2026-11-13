import { describe, expect, it } from '@jest/globals';

import { mockPhotoUrl, rememberMockUpload } from './mock-photo';

describe('mockPhotoUrl', () => {
  it('시험 데이터의 사진은 샘플 사진 주소로 바꾼다', () => {
    expect(mockPhotoUrl('/assets/sample-profile-user-2/download')).toContain('picsum.photos');
  });

  it('기억해 둔 것이 없는 사진은 바꾸지 않는다', () => {
    expect(mockPhotoUrl('/assets/asset-99/download')).toBeNull();
  });

  it('테스트 모드에서 방금 올린 사진은 고른 사진 주소를 그대로 준다', () => {
    rememberMockUpload('asset-7', 'file:///cache/picked.jpg');
    expect(mockPhotoUrl('/assets/asset-7/download')).toBe('file:///cache/picked.jpg');
    // 여행 사진 목록은 /api/v1을 붙인 주소로 그린다
    expect(mockPhotoUrl('/api/v1/assets/asset-7/download')).toBe('file:///cache/picked.jpg');
  });
});
