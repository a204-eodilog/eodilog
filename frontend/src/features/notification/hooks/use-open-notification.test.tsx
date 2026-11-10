import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { getTrip } from '@/features/trip/api';

import { readNotification } from '../api';
import { notification, sampleNotifications } from '../testing';

import { notificationKeys } from './notification-keys';
import { useOpenNotification } from './use-open-notification';

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
}));
jest.mock('../api', () => ({ readNotification: jest.fn() }));
jest.mock('@/features/trip/api', () => ({ getTrip: jest.fn() }));
jest.mock('@/components/ui', () => ({ toast: { show: jest.fn(), error: jest.fn() } }));

const mockRead = jest.mocked(readNotification);
const mockTrip = jest.mocked(getTrip);

const notFound = () =>
  Object.assign(new Error('404'), {
    isAxiosError: true,
    response: { status: 404, data: { code: 'TRIP_NOT_FOUND' } },
  });

async function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  client.setQueryData(notificationKeys.list, {
    pages: [{ data: sampleNotifications(), page: { nextCursor: null, hasNext: false } }],
    pageParams: [null],
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = await renderHook(() => useOpenNotification(), { wrapper });
  return { client, open: result.current };
}

const [pollOpened, followRequested] = sampleNotifications();

beforeEach(() => {
  jest.clearAllMocks();
  mockRead.mockImplementation(async (id) => notification({ id, readAt: 'now' }));
  mockTrip.mockResolvedValue({ id: 'trip-1' } as Awaited<ReturnType<typeof getTrip>>);
});

describe('알림 열기', () => {
  it('읽음으로 바꾸고 여행을 확인한 뒤 투표 화면으로 간다', async () => {
    const { client, open } = await setup();
    let result: string | undefined;
    await act(async () => {
      result = await open(pollOpened);
    });
    expect(result).toBe('opened');
    expect(mockRead).toHaveBeenCalledWith('n-1');
    expect(mockTrip).toHaveBeenCalledWith('trip-1');
    expect(mockRouter.push).toHaveBeenCalledWith('/trips/trip-1/polls/poll-1');
    const listed = client.getQueryData<{
      pages: { data: { id: string; readAt: string | null }[] }[];
    }>(notificationKeys.list);
    expect(listed?.pages[0].data[0].readAt).not.toBeNull();
  });

  it('여행이 없으면 볼 수 없음으로 간다', async () => {
    mockTrip.mockRejectedValue(notFound());
    const { open } = await setup();
    await act(async () => {
      await open(pollOpened);
    });
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/notifications/gone',
      params: { id: 'n-1' },
    });
  });

  it('여행이 403이어도 볼 수 없음으로 간다', async () => {
    mockTrip.mockRejectedValue(
      Object.assign(new Error('403'), {
        isAxiosError: true,
        response: { status: 403, data: { code: 'FORBIDDEN' } },
      }),
    );
    const { open } = await setup();
    await act(async () => {
      await open(pollOpened);
    });
    expect(mockTrip).toHaveBeenCalledWith('trip-1');
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/notifications/gone',
      params: { id: 'n-1' },
    });
  });

  it('여행 확인이 404·403이 아닌 이유로 실패하면 그대로 이동한다', async () => {
    mockTrip.mockRejectedValue(new Error('network'));
    const { open } = await setup();
    await act(async () => {
      await open(pollOpened);
    });
    expect(mockRouter.push).toHaveBeenCalledWith('/trips/trip-1/polls/poll-1');
  });

  it('읽음 요청이 실패해도 이동하고, 여행이 없는 대상은 확인하지 않는다', async () => {
    mockRead.mockRejectedValue(new Error('500'));
    const { open } = await setup();
    await act(async () => {
      await open(followRequested);
    });
    expect(mockTrip).not.toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith('/friends');
  });

  it('두 번 빠르게 눌러도 이동은 한 번', async () => {
    const { open } = await setup();
    let second: string | undefined;
    await act(async () => {
      const first = open(pollOpened);
      second = await open(pollOpened);
      await first;
    });
    expect(second).toBe('busy');
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });

  it('이미 읽은 알림은 읽음 요청을 보내지 않고, 모르는 대상은 이동하지 않는다', async () => {
    const { open } = await setup();
    let result: string | undefined;
    await act(async () => {
      result = await open(
        notification({ id: 'x', readAt: 'then', target: { type: 'FEED', id: 'f-1' } }),
      );
    });
    expect(result).toBe('none');
    expect(mockRead).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});
