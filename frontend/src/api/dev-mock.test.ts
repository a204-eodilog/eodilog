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
