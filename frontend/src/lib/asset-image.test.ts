import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://test', devMock: false } }));
jest.mock('@/stores/session-store', () => ({
  useSessionStore: { getState: () => ({ accessToken: 'token' }) },
}));
jest.mock('@/api/session', () => ({ API_BASE_PATH: '/api/v1' }));

import { assetSource } from './asset-image';

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
});
