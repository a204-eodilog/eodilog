import { describe, expect, it, jest } from '@jest/globals';
import type { InternalAxiosRequestConfig } from 'axios';

import { devMockAdapter, devMockControls } from './dev-mock';

jest.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://test', devMockNewUser: false } }));

const call = async (method: string, url: string, data?: unknown, key?: string) => {
  const res = await devMockAdapter({
    method,
    url,
    headers: key ? { 'Idempotency-Key': key } : {},
    params: {},
    data: data === undefined ? undefined : JSON.stringify(data),
  } as unknown as InternalAxiosRequestConfig);
  return res as { status: number; data: { data: Record<string, unknown> } };
};

async function analyze() {
  const accepted = await call(
    'post',
    '/trips/trip-1/expense-voice-drafts',
    undefined,
    `k-${Math.random()}`,
  );
  const jobId = accepted.data.data.jobId as string;
  let job = (await call('get', `/jobs/${jobId}`)).data.data;
  while (job.status === 'QUEUED' || job.status === 'RUNNING')
    job = (await call('get', `/jobs/${jobId}`)).data.data;
  return { accepted, job };
}

describe('테스트 모드 말로 경비 입력', () => {
  it('접수는 202, 기다리면 초안 두 건이 나온다', async () => {
    const { accepted, job } = await analyze();
    expect(accepted.status).toBe(202);
    expect(job.status).toBe('SUCCEEDED');
    const result = job.result as { drafts: { draft: { amountMinor: number } }[] };
    expect(result.drafts.map((d) => d.draft.amountMinor)).toEqual([24000, 12000]);
  });

  it('같은 키로 다시 보내면 같은 작업을 돌려준다', async () => {
    const a = await call('post', '/trips/trip-1/expense-voice-drafts', undefined, 'same-key');
    const b = await call('post', '/trips/trip-1/expense-voice-drafts', undefined, 'same-key');
    expect(b.data.data.jobId).toBe(a.data.data.jobId);
  });

  it('고른 실패 코드로 작업이 끝난다', async () => {
    devMockControls.voice.next('VOICE_NO_SPEECH_OR_EXPENSE');
    const { job } = await analyze();
    expect(job.status).toBe('FAILED');
    expect((job.error as { code: string }).code).toBe('VOICE_NO_SPEECH_OR_EXPENSE');
  });

  it('일괄 저장하면 지출 목록에 나오고, 같은 키는 두 번 만들지 않는다', async () => {
    devMockControls.voice.reset();
    const body = {
      items: [
        {
          title: '택시비',
          memo: null,
          amountMinor: 24000,
          currency: 'KRW',
          payerMemberId: 'member-1-1',
          participantMemberIds: ['member-1-1', 'member-1-2'],
          spentAt: '2026-11-12T09:00:00Z',
        },
      ],
    };
    const first = await call('post', '/trips/trip-1/expenses/batch', body, 'save-1');
    await call('post', '/trips/trip-1/expenses/batch', body, 'save-1');
    expect(first.status).toBe(201);
    const list = await call('get', '/trips/trip-1/expenses');
    expect((list.data.data as unknown as unknown[]).length).toBe(1);
  });

  it('모르는 작업은 404(결과 만료)', async () => {
    await expect(call('get', '/jobs/voice-job-0')).rejects.toMatchObject({
      response: { status: 404 },
    });
  });
});
