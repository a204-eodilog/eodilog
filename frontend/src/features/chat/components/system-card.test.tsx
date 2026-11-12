import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { readEvent } from '@/features/notification/api';
import { notificationKeys } from '@/features/notification/hooks/notification-keys';

import { msg } from '../testing';

import { SystemCard } from './system-card';

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
}));
jest.mock('@/features/notification/api', () => ({ readEvent: jest.fn() }));
// 공통 UI 묶음은 바닥 시트(네이티브 애니메이션)까지 불러와서 카드가 쓰는 것만 둔다
jest.mock('@/components/ui', () => ({ Icon: () => null, toast: { show: jest.fn() } }));

const mockReadEvent = jest.mocked(readEvent);

/** 투표 시스템 카드. 이동 버튼이 있고 갈 화면도 있다 */
const pollCard = (over: Parameters<typeof msg>[1] = {}) =>
  msg(1, {
    type: 'SYSTEM',
    senderId: null,
    text: '투표가 시작됐어요',
    eventId: 'event-1',
    target: { type: 'POLL', id: 'poll-1' },
    ...over,
  });

async function open(message: ReturnType<typeof msg>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  await render(
    <QueryClientProvider client={client}>
      <SystemCard message={message} tripId="trip-1" />
    </QueryClientProvider>,
  );
  await act(async () => {
    fireEvent.press(screen.getByRole('button'));
  });
  return { invalidate };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReadEvent.mockResolvedValue({ eventId: 'event-1', readAt: '2026-11-11T05:00:00Z' });
});

describe('시스템 카드로 소식 열기', () => {
  it('안 읽은 소식이면 같은 소식의 알림을 읽음으로 보내고, 알림 목록과 종 숫자를 새로 받는다', async () => {
    const { invalidate } = await open(pollCard());

    expect(mockReadEvent).toHaveBeenCalledWith('event-1');
    expect(mockRouter.push).toHaveBeenCalledWith('/trips/trip-1/polls/poll-1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: notificationKeys.list });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: notificationKeys.summary });
  });

  it('이미 읽은 소식은 다시 보내지 않고 이동만 한다', async () => {
    await open(pollCard({ eventReadAt: '2026-11-11T04:00:00Z' }));

    expect(mockReadEvent).not.toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });

  it('소식 번호가 없는 카드는 읽음을 보내지 않는다', async () => {
    await open(pollCard({ eventId: null }));

    expect(mockReadEvent).not.toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });

  it('읽음 요청이 실패해도 이동은 한다', async () => {
    mockReadEvent.mockRejectedValue(new Error('404'));

    const { invalidate } = await open(pollCard());

    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
