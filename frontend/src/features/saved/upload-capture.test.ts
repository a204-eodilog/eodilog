import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { apiClient } from '@/api/client';

import { uploadCapture } from './api';

// 실제 저장소로 보내는 경로를 보려고 테스트 모드를 끈다
jest.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://test', devMock: false } }));
jest.mock('@/api/client', () => ({ apiClient: { post: jest.fn() } }));

const post = jest.mocked(apiClient.post);
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  jest.clearAllMocks();
});

describe('S11 캡처 올리기', () => {
  it('읽은 바이트 수로 자리를 받고, ArrayBuffer를 content-length 없이 보낸다', async () => {
    const bytes = new ArrayBuffer(10);
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce({ arrayBuffer: async () => bytes } as Response)
      .mockResolvedValueOnce({ ok: true } as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    post
      .mockResolvedValueOnce({
        data: {
          data: {
            assetId: 'asset-1',
            uploadUrl: 'https://s3.test/put',
            method: 'PUT',
            headers: { 'Content-Type': 'image/png', 'Content-Length': '10' },
          },
        },
      })
      .mockResolvedValueOnce({ data: undefined });

    const id = await uploadCapture({
      uri: 'file:///a.png',
      contentType: 'image/png',
      byteSize: 99,
    });

    expect(id).toBe('asset-1');
    expect(post.mock.calls[0][1]).toEqual({
      purpose: 'CAPTURE',
      contentType: 'image/png',
      byteSize: 10,
    });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://s3.test/put');
    expect(init?.body).toBe(bytes);
    expect(init?.headers).toEqual({ 'Content-Type': 'image/png' });
    expect(post.mock.calls[1][0]).toBe('/assets/asset-1/complete');
  });
});
