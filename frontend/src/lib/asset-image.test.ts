import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { assetSource } from './asset-image';

// jest.mock은 불러오기보다 먼저 실행되도록 맨 위로 끌어올려진다
// 테스트 모드 경우를 보려고 값을 바꿀 수 있게 둔다
const mockEnv = { apiBaseUrl: 'http://test', devMock: false };
jest.mock('@/config/env', () => ({
  get env() {
    return mockEnv;
  },
}));
jest.mock('@/stores/session-store', () => ({
  useSessionStore: { getState: () => ({ accessToken: 'token' }) },
}));
jest.mock('@/api/session', () => ({ API_BASE_PATH: '/api/v1' }));

afterEach(() => {
  mockEnv.devMock = false;
});

describe('assetSource', () => {
  it('명세 경로(/assets/...) 앞에 /api/v1을 붙이고 로그인 토큰을 보낸다', () => {
    expect(assetSource('/assets/a1/download?feedId=f1')).toEqual({
      uri: 'http://test/api/v1/assets/a1/download?feedId=f1',
      headers: { Authorization: 'Bearer token' },
    });
  });

  it('이미 /api/v1이 붙어 있으면 두 번 붙이지 않는다', () => {
    expect(assetSource('/api/v1/assets/a1/download')?.uri).toBe(
      'http://test/api/v1/assets/a1/download',
    );
  });

  it('전체 주소는 그대로, 비었으면 null', () => {
    expect(assetSource('https://cdn.example.com/a.jpg')).toEqual({
      uri: 'https://cdn.example.com/a.jpg',
    });
    expect(assetSource(null)).toBeNull();
  });

  it('기기 안 주소(방금 고른 사진)는 서버 주소를 붙이지 않고 그대로 쓴다', () => {
    expect(assetSource('file:///data/cache/a.jpg')).toEqual({ uri: 'file:///data/cache/a.jpg' });
    expect(assetSource('content://media/1')).toEqual({ uri: 'content://media/1' });
    expect(assetSource('blob:http://localhost:8081/abc')).toEqual({
      uri: 'blob:http://localhost:8081/abc',
    });
  });

  it('시험 사진처럼 생긴 주소도 테스트 모드가 아니면 서버에서 받는다', () => {
    expect(assetSource('/api/v1/assets/sample-1/download')?.uri).toBe(
      'http://test/api/v1/assets/sample-1/download',
    );
  });

  it('테스트 모드에서는 시험 사진만 샘플 사진으로 그리고 나머지 가짜 주소는 그리지 않는다', () => {
    mockEnv.devMock = true;
    expect(assetSource('/api/v1/assets/asset-seed-1/download')).toEqual({
      uri: 'https://picsum.photos/seed/asset-seed-1/600/600',
    });
    // 테스트 모드에서 방금 올린 사진
    expect(assetSource('/api/v1/assets/asset-999/download')).toBeNull();
    expect(assetSource('file:///data/cache/a.jpg')).toEqual({ uri: 'file:///data/cache/a.jpg' });
  });
});
