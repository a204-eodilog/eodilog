import { expect, it } from '@jest/globals';

import { mockPhotoUrl } from './mock-photo';

it('시험 사진 주소는 자산 id를 씨앗으로 한 샘플 사진 주소가 된다', () => {
  expect(mockPhotoUrl('/api/v1/assets/asset-seed-3/download')).toBe(
    'https://picsum.photos/seed/asset-seed-3/600/600',
  );
  expect(mockPhotoUrl('/assets/sample-2/download?feedId=f-1')).toBe(
    'https://picsum.photos/seed/sample-2/600/600',
  );
});

it('같은 주소는 늘 같은 사진, 다른 주소는 다른 사진이다', () => {
  const a = mockPhotoUrl('/assets/sample-profile-people-1/download');
  expect(mockPhotoUrl('/assets/sample-profile-people-1/download')).toBe(a);
  expect(mockPhotoUrl('/assets/sample-profile-people-2/download')).not.toBe(a);
});

it('시험 사진이 아닌 주소는 바꾸지 않는다', () => {
  // 테스트 모드에서 방금 올린 사진의 자산 id
  expect(mockPhotoUrl('/api/v1/assets/asset-1731200000000/download')).toBeNull();
  expect(mockPhotoUrl('/assets/abc/download')).toBeNull();
  expect(mockPhotoUrl('sample-1')).toBeNull();
});
