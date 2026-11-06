import { describe, expect, it, jest } from '@jest/globals';
import type { InternalAxiosRequestConfig } from 'axios';

jest.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://test', devMockNewUser: false } }));

import { devMockAdapter } from './dev-mock';

const get = async (url: string) => {
  const res = await devMockAdapter({
    method: 'get',
    url,
    headers: {},
    params: {},
  } as unknown as InternalAxiosRequestConfig);
  return res.data as { data: Record<string, unknown> & { items?: Record<string, unknown>[] } };
};

describe('테스트 모드 피드 상세', () => {
  it('목록에서 본 카드와 같은 제목을 돌려준다', async () => {
    const list = await get('/users/people-1/feeds');
    const second = (list.data.items ?? (list.data as unknown as Record<string, unknown>[]))[1] as {
      id: string;
      title: string;
    };
    const detail = await get(`/feeds/${second.id}`);
    expect(detail.data.title).toBe(second.title);
  });
});

describe('테스트 모드 개인 저장(S08 나만 보기)', () => {
  const put = (url: string) =>
    devMockAdapter({
      method: 'put',
      url,
      headers: {},
      data: '{}',
    } as unknown as InternalAxiosRequestConfig);

  it('S07·N3 예시 장소는 저장되고 목록에 들어간다', async () => {
    await put('/me/bookmarks/p1');
    const list = await get('/me/bookmarks');
    const items = (list as unknown as { data: { place: { id: string } }[] }).data;
    expect(items.some((b) => b.place.id === 'p1')).toBe(true);
  });

  it('테스트 모드에 없는 장소는 404', async () => {
    await expect(put('/me/bookmarks/place-missing')).rejects.toBeTruthy();
  });
});

describe('테스트 모드 편의시설(S28)', () => {
  it('시설 좌표가 모두 숫자다(지도 오류 방지)', async () => {
    const res = await devMockAdapter({
      method: 'get',
      url: '/places/p1/facilities',
      headers: {},
      params: { type: 'EV_CHARGER' },
    } as unknown as InternalAxiosRequestConfig);
    const items = (res.data as { data: { latitude: number; longitude: number }[] }).data;
    expect(items.length).toBeGreaterThan(0);
    for (const f of items) {
      expect(Number.isFinite(f.latitude)).toBe(true);
      expect(Number.isFinite(f.longitude)).toBe(true);
    }
  });
});
