import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { getSettings } from '@/features/settings/api';

import {
  applyPhotoClassification,
  getClassificationJob,
  getTripPhotos,
  requestPhotoClassification,
} from './api';
import { classifyTiming, classifyUploaded } from './classify';
import type { TripPhoto } from './types';

jest.mock('./api', () => ({
  applyPhotoClassification: jest.fn(),
  getClassificationJob: jest.fn(),
  getTripPhotos: jest.fn(),
  requestPhotoClassification: jest.fn(),
}));
jest.mock('@/features/settings/api', () => ({ getSettings: jest.fn() }));

const request = jest.mocked(requestPhotoClassification);
const getJob = jest.mocked(getClassificationJob);
const apply = jest.mocked(applyPhotoClassification);
const listPhotos = jest.mocked(getTripPhotos);
const settings = jest.mocked(getSettings);

const photo = (id: string, version = 1): TripPhoto => ({
  id,
  assetId: `a-${id}`,
  tripId: 't1',
  batchId: 'b1',
  uploaderMemberId: 'm1',
  placeId: null,
  capturedAt: null,
  topics: [],
  groupId: null,
  version,
});

/** axios 오류 모양(toApiError가 읽는 부분만) */
const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { status, data: {}, headers: {} },
  });

const succeeded = (ids: string[]) => ({
  status: 'SUCCEEDED' as const,
  result: { photos: ids.map((photoId) => ({ photoId, status: 'SUCCEEDED' })) },
});

const mode = (photoClassification: 'AUTO' | 'CONFIRM' | 'OFF') =>
  settings.mockResolvedValue({ ai: { photoClassification } } as Awaited<
    ReturnType<typeof getSettings>
  >);

beforeEach(() => {
  jest.clearAllMocks();
  classifyTiming.intervalMs = 0;
  classifyTiming.maxPolls = 5;
  mode('AUTO');
  request.mockResolvedValue('job-1');
  apply.mockResolvedValue(undefined);
});

describe('classifyUploaded', () => {
  it('AUTO면 요청하고 기다린 뒤 성공한 사진만 요청 때 version으로 적용한다', async () => {
    getJob.mockResolvedValueOnce({ status: 'RUNNING', result: null }).mockResolvedValueOnce({
      status: 'SUCCEEDED',
      result: {
        photos: [
          { photoId: 'p1', status: 'SUCCEEDED' },
          { photoId: 'p2', status: 'FAILED' },
        ],
      },
    });
    await expect(classifyUploaded('t1', [photo('p1', 2), photo('p2')])).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith('t1', ['p1', 'p2']);
    expect(apply).toHaveBeenCalledWith('t1', 'job-1', [{ photoId: 'p1', version: 2 }]);
  });

  it('CONFIRM·OFF이거나 설정을 못 읽으면 요청하지 않는다', async () => {
    mode('CONFIRM');
    await expect(classifyUploaded('t1', [photo('p1')])).resolves.toBe(false);
    mode('OFF');
    await expect(classifyUploaded('t1', [photo('p1')])).resolves.toBe(false);
    settings.mockRejectedValueOnce(httpError(500));
    await expect(classifyUploaded('t1', [photo('p1')])).resolves.toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('작업이 실패·취소되거나 시간 안에 끝나지 않으면 적용하지 않는다', async () => {
    getJob.mockResolvedValueOnce({ status: 'FAILED', result: null });
    await expect(classifyUploaded('t1', [photo('p1')])).resolves.toBe(false);
    getJob.mockResolvedValueOnce({ status: 'CANCELLED', result: null });
    await expect(classifyUploaded('t1', [photo('p1')])).resolves.toBe(false);
    getJob.mockResolvedValue({ status: 'RUNNING', result: null });
    await expect(classifyUploaded('t1', [photo('p1')])).resolves.toBe(false);
    expect(getJob).toHaveBeenCalledTimes(2 + classifyTiming.maxPolls);
    expect(apply).not.toHaveBeenCalled();
  });

  it('결과 조회가 잠깐 실패하면 다시 보고, 404면 바로 끝낸다', async () => {
    getJob.mockRejectedValueOnce(httpError(503)).mockResolvedValueOnce(succeeded(['p1']));
    await expect(classifyUploaded('t1', [photo('p1')])).resolves.toBe(true);

    getJob.mockReset();
    getJob.mockRejectedValueOnce(httpError(404));
    await expect(classifyUploaded('t1', [photo('p1')])).resolves.toBe(false);
    expect(getJob).toHaveBeenCalledTimes(1);
  });

  it('적용이 409면 그사이 바뀌지 않은 사진만 새 작업으로 한 번 더 보낸다', async () => {
    getJob.mockResolvedValue(succeeded(['p1', 'p2']));
    apply.mockRejectedValueOnce(httpError(409));
    // p2는 그사이 장소를 고쳐 version이 올랐다
    listPhotos.mockResolvedValue([photo('p1'), photo('p2', 2)]);
    request.mockResolvedValueOnce('job-1').mockResolvedValueOnce('job-2');
    getJob.mockResolvedValueOnce(succeeded(['p1', 'p2'])).mockResolvedValueOnce(succeeded(['p1']));

    await expect(classifyUploaded('t1', [photo('p1'), photo('p2')])).resolves.toBe(true);
    expect(request).toHaveBeenLastCalledWith('t1', ['p1']);
    expect(apply).toHaveBeenLastCalledWith('t1', 'job-2', [{ photoId: 'p1', version: 1 }]);
  });

  it('다시 보낸 것도 409면 더 되풀이하지 않는다', async () => {
    getJob.mockResolvedValue(succeeded(['p1']));
    apply.mockRejectedValue(httpError(409));
    listPhotos.mockResolvedValue([photo('p1')]);
    await expect(classifyUploaded('t1', [photo('p1')])).resolves.toBe(false);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('요청이 404(그사이 지운 사진)면 남은 사진만 다시 요청한다', async () => {
    request.mockRejectedValueOnce(httpError(404)).mockResolvedValueOnce('job-2');
    listPhotos.mockResolvedValue([photo('p2')]);
    getJob.mockResolvedValue(succeeded(['p2']));
    await expect(classifyUploaded('t1', [photo('p1'), photo('p2')])).resolves.toBe(true);
    expect(request).toHaveBeenLastCalledWith('t1', ['p2']);
  });

  it('50장을 넘으면 묶음마다 따로 요청하고, 한 묶음이 실패해도 다른 묶음은 적용한다', async () => {
    const many = Array.from({ length: 60 }, (_, i) => photo(`p${i}`));
    request.mockImplementation(async (_trip, ids) => (ids.length === 50 ? 'job-a' : 'job-b'));
    getJob.mockImplementation(async (jobId) =>
      jobId === 'job-a'
        ? { status: 'FAILED', result: null }
        : succeeded(many.slice(50).map((p) => p.id)),
    );
    await expect(classifyUploaded('t1', many)).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0][1]).toBe('job-b');
  });
});
