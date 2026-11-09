import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { getTrip } from '@/features/trip/api';

import { getNotifications, getPollBrief, readNotification } from '../api';
import { notification, SAMPLE_NOW, sampleNotifications, samplePopupItems } from '../testing';
import type { NotificationView } from '../types';

import { NotificationPopupHost, resetPopupMemory } from './popup-host';

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
}));
jest.mock('../api', () => ({
  getNotifications: jest.fn(),
  getPollBrief: jest.fn(),
  readNotification: jest.fn(),
}));
jest.mock('@/features/trip/api', () => ({ getTrip: jest.fn() }));
jest.mock('@/components/ui', () => {
  const actual = jest.requireActual<typeof import('@/components/ui/icon')>('@/components/ui/icon');
  return { Icon: actual.Icon, toast: { show: jest.fn(), error: jest.fn() } };
});

const mockList = jest.mocked(getNotifications);
const mockBrief = jest.mocked(getPollBrief);
const mockRead = jest.mocked(readNotification);
const mockTrip = jest.mocked(getTrip);

let appStateHandler: ((state: AppStateStatus) => void) | null = null;

const page = (data: NotificationView[]) => ({
  data,
  page: { nextCursor: null, hasNext: false },
});

function renderHost() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NotificationPopupHost />
    </QueryClientProvider>,
  );
}

/** 앱이 뒤로 갔다가 다시 앞으로 온 것처럼 */
async function resume() {
  await act(async () => {
    appStateHandler?.('background');
    appStateHandler?.('active');
  });
}

beforeEach(() => {
  jest.useFakeTimers({ now: SAMPLE_NOW, advanceTimers: true });
  jest.clearAllMocks();
  resetPopupMemory();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    appStateHandler = handler as (state: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  mockList.mockResolvedValue(page(samplePopupItems()));
  mockBrief.mockResolvedValue({ type: 'REGION', closesAt: '2026-10-28T12:00:00Z' });
  mockRead.mockImplementation(async (id) => notification({ id, readAt: 'now' }));
  mockTrip.mockResolvedValue({ id: 'trip-1' } as Awaited<ReturnType<typeof getTrip>>);
});
afterEach(() => {
  jest.useRealTimers();
});

describe('S48 알림 팝업', () => {
  it('안 읽은 행동 알림이 여럿이면 모아 보기, 닫은 뒤 돌아와도 다시 뜨지 않는다', async () => {
    await renderHost();
    expect(await screen.findByText('새 알림 3개')).toBeTruthy();
    expect(screen.getByText('겨울 여행 투표 마감 1시간 전이에요')).toBeTruthy();
    expect(screen.getByText('팔로우 요청 · 오늘 20:05')).toBeTruthy();
    expect(mockList).toHaveBeenCalledWith({ unreadOnly: true });
    await fireEvent.press(screen.getByText('닫기'));
    expect(screen.queryByText('새 알림 3개')).toBeNull();
    await resume();
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('새 알림 3개')).toBeNull();
  });

  it('돌아왔을 때 새 행동 알림이 생겼으면 그것만 띄운다', async () => {
    await renderHost();
    await fireEvent.press(await screen.findByText('닫기'));
    mockList.mockResolvedValue(
      page([
        notification({
          id: 'new-1',
          kind: 'FOLLOW_REQUESTED',
          message: '세은님이 팔로우를 요청했어요.',
          target: { type: 'USER', id: 'u-2' },
          createdAt: '2026-11-18T11:50:00Z',
        }),
        ...samplePopupItems(),
      ]),
    );
    await resume();
    expect(await screen.findByText('새 알림 1개')).toBeTruthy();
    expect(screen.getByText('세은님이 팔로우를 요청했어요')).toBeTruthy();
  });

  it('알림 모두 보기는 목록으로, 줄을 누르면 그 알림을 연다', async () => {
    await renderHost();
    await fireEvent.press(await screen.findByText('알림 모두 보기'));
    expect(mockRouter.push).toHaveBeenCalledWith('/notifications');
    expect(screen.queryByText('새 알림 3개')).toBeNull();
  });

  it('팝업 줄을 누르면 읽음으로 바꾸고 대상 화면으로 간다', async () => {
    await renderHost();
    await fireEvent.press(await screen.findByText('지호님이 팔로우를 요청했어요'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/friends'));
    expect(mockRead).toHaveBeenCalledWith('p-2');
  });

  it('투표 시작 하나뿐이면 투표 시작 팝업과 마감 시각', async () => {
    const [opened] = sampleNotifications();
    mockList.mockResolvedValue(page([opened]));
    await renderHost();
    expect(await screen.findByText('지역 투표가 시작됐어요')).toBeTruthy();
    expect(screen.getByText('겨울 여행 투표가 시작됐어요')).toBeTruthy();
    expect(screen.getByText('10.28(수) 21:00 마감')).toBeTruthy();
    expect(mockBrief).toHaveBeenCalledWith('trip-1', 'poll-1');
    await fireEvent.press(screen.getByText('투표하러 가기'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/trips/trip-1/polls/poll-1'));
  });

  it('투표 정보를 못 받으면 마감 줄 없이', async () => {
    const [opened] = sampleNotifications();
    mockList.mockResolvedValue(page([opened]));
    mockBrief.mockRejectedValue(new Error('404'));
    await renderHost();
    expect(await screen.findByText('투표가 시작됐어요')).toBeTruthy();
    expect(screen.queryByText(/마감$/)).toBeNull();
    await fireEvent.press(screen.getByText('나중에'));
    expect(screen.queryByText('투표가 시작됐어요')).toBeNull();
  });

  it('행동 알림이 없거나 받지 못하면 띄우지 않는다', async () => {
    const course = notification({ id: 'c-1', kind: 'COURSE_CHANGED', message: '코스를 고쳤어요.' });
    mockList.mockResolvedValueOnce(page([course])).mockRejectedValueOnce(new Error('503'));
    await renderHost();
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
    await resume();
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
    expect(screen.toJSON()).toBeNull();
  });
});
