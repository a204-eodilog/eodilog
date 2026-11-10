import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import {
  cancelAsset,
  completeAsset,
  createPhotoBatch,
  putPhoto,
  readPhoto,
  registerPhoto,
  requestUploadIntent,
} from '../api';
import type { PickedPhoto } from '../types';
import { usePhotoUpload } from './use-photo-upload';

jest.mock('../api', () => ({
  createPhotoBatch: jest.fn(),
  readPhoto: jest.fn(),
  requestUploadIntent: jest.fn(),
  putPhoto: jest.fn(),
  completeAsset: jest.fn(),
  cancelAsset: jest.fn(),
  registerPhoto: jest.fn(),
}));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `key-${++n}` };
});

const batch = jest.mocked(createPhotoBatch);
const read = jest.mocked(readPhoto);
const intent = jest.mocked(requestUploadIntent);
const put = jest.mocked(putPhoto);
const complete = jest.mocked(completeAsset);
const cancel = jest.mocked(cancelAsset);
const register = jest.mocked(registerPhoto);

const photo = (key: string): PickedPhoto => ({
  key,
  uri: `file:///${key}.jpg`,
  contentType: 'image/jpeg',
  byteSize: 0,
  capturedAt: '2026-11-14T01:00:00.000Z',
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => usePhotoUpload('trip-1'), { wrapper });
}

let assetSeq = 0;

beforeEach(() => {
  jest.clearAllMocks();
  assetSeq = 0;
  batch.mockResolvedValue({
    id: 'batch-1',
    tripId: 'trip-1',
    fileCount: 2,
    registeredCount: 0,
    createdAt: '',
  });
  read.mockResolvedValue(new ArrayBuffer(1234));
  intent.mockImplementation(async () => ({
    assetId: `asset-${++assetSeq}`,
    uploadUrl: 'https://s3/put',
    method: 'PUT',
    headers: {},
    expiresAt: '',
  }));
  put.mockResolvedValue(undefined);
  complete.mockResolvedValue(undefined);
  cancel.mockResolvedValue(undefined);
  register.mockImplementation(async () => ({}) as Awaited<ReturnType<typeof registerPhoto>>);
});

describe('usePhotoUpload (S30)', () => {
  it('배치 하나로 한 장씩 올리고 등록하면 done', async () => {
    const { result } = await setup();
    await act(async () => result.current.start([photo('a'), photo('b')]));
    await waitFor(() => expect(result.current.phase).toBe('done'));

    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0].slice(0, 2)).toEqual(['trip-1', 2]);
    // 선택창이 크기를 주지 않아도 실제 바이트 크기로 자리를 받는다
    expect(intent).toHaveBeenCalledWith({
      tripId: 'trip-1',
      batchId: 'batch-1',
      contentType: 'image/jpeg',
      byteSize: 1234,
    });
    expect(register).toHaveBeenNthCalledWith(1, 'trip-1', {
      batchId: 'batch-1',
      assetId: 'asset-1',
      capturedAt: '2026-11-14T01:00:00.000Z',
    });
    expect(result.current.items.map((i) => i.status)).toEqual(['done', 'done']);
  });

  it('등록만 실패한 사진은 다시 시도할 때 파일을 다시 올리지 않고 등록만 한다', async () => {
    register.mockRejectedValueOnce(new Error('network'));
    const { result } = await setup();
    await act(async () => result.current.start([photo('a'), photo('b')]));
    await waitFor(() => expect(result.current.phase).toBe('failed'));
    expect(result.current.items.map((i) => i.status)).toEqual(['failed', 'done']);

    await act(async () => result.current.retryFailed());
    await waitFor(() => expect(result.current.phase).toBe('done'));
    expect(batch).toHaveBeenCalledTimes(1);
    expect(intent).toHaveBeenCalledTimes(2);
    expect(register).toHaveBeenLastCalledWith(
      'trip-1',
      expect.objectContaining({ assetId: 'asset-1' }),
    );
  });

  it('완료 확인이 실패한 사진은 그 파일을 지우고 새 자리로 다시 올린다', async () => {
    complete.mockRejectedValueOnce(new Error('422'));
    const { result } = await setup();
    await act(async () => result.current.start([photo('a')]));
    await waitFor(() => expect(result.current.phase).toBe('failed'));

    await act(async () => result.current.retryFailed());
    await waitFor(() => expect(result.current.phase).toBe('done'));
    expect(cancel).toHaveBeenCalledWith('asset-1');
    expect(register).toHaveBeenCalledWith(
      'trip-1',
      expect.objectContaining({ assetId: 'asset-2' }),
    );
  });

  it('배치를 못 만들면 모두 실패, 다시 시도하면 같은 키로 배치를 다시 요청한다', async () => {
    batch.mockRejectedValueOnce(new Error('network'));
    const { result } = await setup();
    await act(async () => result.current.start([photo('a')]));
    await waitFor(() => expect(result.current.phase).toBe('failed'));
    expect(result.current.items[0].status).toBe('failed');

    await act(async () => result.current.retryFailed());
    await waitFor(() => expect(result.current.phase).toBe('done'));
    expect(batch.mock.calls[1][2]).toBe(batch.mock.calls[0][2]);
  });

  it('취소하면 남은 사진을 멈추고 완료 전 파일을 지운다', async () => {
    let releasePut: () => void = () => {};
    put.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releasePut = resolve;
        }),
    );
    const { result } = await setup();
    await act(async () => result.current.start([photo('a'), photo('b')]));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));

    let done = -1;
    await act(async () => {
      done = result.current.cancel();
    });
    expect(done).toBe(0);
    expect(cancel).toHaveBeenCalledWith('asset-1');
    await act(async () => releasePut());
    expect(register).not.toHaveBeenCalled();
    expect(intent).toHaveBeenCalledTimes(1);
  });
});
