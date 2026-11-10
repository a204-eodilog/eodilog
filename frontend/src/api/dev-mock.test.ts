import { describe, expect, it, jest } from '@jest/globals';
import type { InternalAxiosRequestConfig } from 'axios';

import { devMockAdapter } from './dev-mock';

// jest.mock은 불러오기보다 먼저 실행되도록 맨 위로 끌어올려진다
jest.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://test', devMockNewUser: false } }));

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

const send = (method: 'post' | 'delete', url: string, data?: unknown) =>
  devMockAdapter({
    method,
    url,
    headers: {},
    params: {},
    data: data === undefined ? undefined : JSON.stringify(data),
  } as unknown as InternalAxiosRequestConfig);

describe('테스트 모드 기록까지 삭제', () => {
  it('버전이 맞으면 202로 접수하고 피드를 내린다. 다시 보내면 404', async () => {
    const mine = (await get('/me/feeds')) as unknown as {
      data: { id: string; tripId: string; version: number }[];
    };
    const feed = mine.data[0];
    await expect(
      send('post', `/feeds/${feed.id}/delete-own-records`, { expectedVersion: feed.version + 1 }),
    ).rejects.toMatchObject({ response: { status: 409 } });

    const res = await send('post', `/feeds/${feed.id}/delete-own-records`, {
      expectedVersion: feed.version,
    });
    expect(res.status).toBe(202);
    expect((res.data as { data: { jobId: string } }).data.jobId).toBeTruthy();
    expect((await get(`/trips/${feed.tripId}/feed`)).data).toBeNull();

    await expect(
      send('post', `/feeds/${feed.id}/delete-own-records`, { expectedVersion: feed.version }),
    ).rejects.toMatchObject({ response: { status: 404 } });
  });
});

describe('테스트 모드 사진 일괄 변경', () => {
  it('버전이 다르면 아무것도 바꾸지 않고, 맞으면 모두 장소를 연결한다', async () => {
    const photos = { 'photo-seed-8': 1, 'photo-seed-9': 1 };
    const targets = Object.entries(photos).map(([photoId, v]) => ({ photoId, expectedVersion: v }));
    await expect(
      send('post', '/trips/trip-1/photos/batch', {
        action: 'UPDATE',
        photos: [targets[0], { ...targets[1], expectedVersion: 9 }],
        placeId: 'place-seomyeon',
      }),
    ).rejects.toMatchObject({ response: { status: 409 } });

    const res = await send('post', '/trips/trip-1/photos/batch', {
      action: 'UPDATE',
      photos: targets,
      placeId: 'place-seomyeon',
    });
    const changed = (res.data as { data: { photos: { placeId: string; version: number }[] } }).data
      .photos;
    expect(changed.map((p) => [p.placeId, p.version])).toEqual([
      ['place-seomyeon', 2],
      ['place-seomyeon', 2],
    ]);
  });
});
