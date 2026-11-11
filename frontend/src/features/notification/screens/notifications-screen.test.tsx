import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { toast } from '@/components/ui';
import { getAllMyTrips } from '@/features/my-trips/api';
import { getTrip } from '@/features/trip/api';

import { getNotifications, readAllNotifications, readNotification } from '../api';
import { SAMPLE_NOW, sampleNotifications } from '../testing';

import { NotificationsScreen } from './notifications-screen';

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
const mockRouter = { push: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
}));
jest.mock('../api', () => ({
  getNotifications: jest.fn(),
  readAllNotifications: jest.fn(),
  readNotification: jest.fn(),
  dismissNotification: jest.fn(),
}));
jest.mock('@/features/my-trips/api', () => ({ getAllMyTrips: jest.fn() }));
jest.mock('@/features/trip/api', () => ({ getTrip: jest.fn() }));
jest.mock('@/components/ui', () => {
  const actual = jest.requireActual<typeof import('@/components/ui/icon')>('@/components/ui/icon');
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Icon: actual.Icon,
    Header: ({ title, right }: { title?: string; right?: ReactNode }) => (
      <View>
        <Text>{title}</Text>
        {right}
      </View>
    ),
    Button: ({ label, onPress }: { label: string; onPress?: () => void }) => (
      <Pressable onPress={onPress} accessibilityRole="button">
        <Text>{label}</Text>
      </Pressable>
    ),
    toast: { show: jest.fn(), success: jest.fn(), error: jest.fn() },
  };
});

const mockList = jest.mocked(getNotifications);
const mockReadAll = jest.mocked(readAllNotifications);
const mockTrips = jest.mocked(getAllMyTrips);
const mockTrip = jest.mocked(getTrip);
const mockRead = jest.mocked(readNotification);

const page = (data = sampleNotifications()) => ({
  data,
  page: { nextCursor: null, hasNext: false },
});

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const metrics = {
    frame: { x: 0, y: 0, width: 375, height: 812 },
    insets: { top: 47, left: 0, right: 0, bottom: 34 },
  };
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <NotificationsScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.useFakeTimers({ now: SAMPLE_NOW, advanceTimers: true });
  jest.clearAllMocks();
  mockList.mockResolvedValue(page());
  mockReadAll.mockResolvedValue(3);
  mockTrips.mockResolvedValue([{ id: 'trip-1' }] as Awaited<ReturnType<typeof getAllMyTrips>>);
  mockTrip.mockResolvedValue({ id: 'trip-1' } as Awaited<ReturnType<typeof getTrip>>);
  mockRead.mockImplementation(async (id) => ({ ...sampleNotifications()[0], id, readAt: 'now' }));
});
afterEach(() => {
  jest.useRealTimers();
});

describe('S49 알림 목록', () => {
  it('오늘과 이전으로 나누고 안 읽은 알림과 나간 여행을 표시한다', async () => {
    await renderScreen();
    expect(await screen.findByText('겨울 여행 투표가 시작됐어요')).toBeTruthy();
    expect(screen.getByText('오늘')).toBeTruthy();
    expect(screen.getByText('이전')).toBeTruthy();
    expect(screen.getByText('20:40')).toBeTruthy();
    expect(screen.getByText('11.17(화)')).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: '읽지 않음, 겨울 여행 투표가 시작됐어요, 투표 시작, 20:40',
      }),
    ).toBeTruthy();
    expect(await screen.findByText('나간 여행')).toBeTruthy();
  });

  it('모두 읽음은 가장 최근 알림 시각까지 보내고 점을 지운다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByRole('button', { name: '모두 읽음' }));
    expect(mockReadAll).toHaveBeenCalledWith('2026-11-18T11:40:00Z');
    await waitFor(() => expect(screen.queryByRole('button', { name: /^읽지 않음/ })).toBeNull());
    // 읽지 않은 알림이 없으면 버튼을 숨긴다
    expect(screen.queryByRole('button', { name: '모두 읽음' })).toBeNull();
  });

  it('모두 읽음이 실패하면 알리고 안 읽음으로 되돌린다', async () => {
    mockReadAll.mockRejectedValue(new Error('500'));
    await renderScreen();
    await fireEvent.press(await screen.findByRole('button', { name: '모두 읽음' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('읽음으로 바꾸지 못했어요. 다시 시도해 주세요'),
    );
    expect(screen.getAllByRole('button', { name: /^읽지 않음/ })).toHaveLength(3);
  });

  it('알림이 없으면 알림 없음, 모두 읽음 버튼도 없다', async () => {
    mockList.mockResolvedValue(page([]));
    await renderScreen();
    expect(await screen.findByText('새 알림이 없어요')).toBeTruthy();
    expect(screen.getByText('여행 소식과 팔로우 요청이 여기에 모여요')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '모두 읽음' })).toBeNull();
  });

  it('불러오지 못하면 실패 안내와 다시 시도', async () => {
    mockList.mockRejectedValueOnce(new Error('503'));
    await renderScreen();
    expect(await screen.findByText('불러오지 못했어요')).toBeTruthy();
    expect(screen.queryByText('다시 시도해 주세요')).toBeNull();
    await fireEvent.press(screen.getByText('다시 시도'));
    expect(await screen.findByText('겨울 여행 투표가 시작됐어요')).toBeTruthy();
  });

  it('내 여행 목록을 못 받으면 나간 여행 표시만 빠진다', async () => {
    mockTrips.mockRejectedValue(new Error('500'));
    await renderScreen();
    expect(await screen.findByText('가을 소풍 투표가 시작됐어요')).toBeTruthy();
    expect(screen.queryByText('나간 여행')).toBeNull();
  });

  it('알림을 누르면 읽음으로 바꾸고 대상 화면으로 간다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByText('겨울 여행 투표가 시작됐어요'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/trips/trip-1/polls/poll-1'));
    expect(mockRead).toHaveBeenCalledWith('n-1');
    expect(
      await screen.findByRole('button', { name: '겨울 여행 투표가 시작됐어요, 투표 시작, 20:40' }),
    ).toBeTruthy();
  });

  it('나간 여행 표시가 있어도 여행을 받아 보고, 볼 수 없으면 볼 수 없음으로 간다', async () => {
    mockTrip.mockImplementation(async (id) => {
      if (id === 'trip-gone')
        throw Object.assign(new Error('404'), {
          isAxiosError: true,
          response: { status: 404, data: { code: 'TRIP_NOT_FOUND' } },
        });
      return { id } as Awaited<ReturnType<typeof getTrip>>;
    });
    await renderScreen();
    await screen.findByText('나간 여행');
    await fireEvent.press(screen.getByText('가을 소풍 투표가 시작됐어요'));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/notifications/gone',
        params: { id: 'n-9' },
      }),
    );
    expect(mockTrip).toHaveBeenCalledWith('trip-gone');
  });

  it('끝까지 내리면 다음 쪽을 이어 받는다', async () => {
    const [first, ...rest] = sampleNotifications();
    mockList.mockImplementation(async ({ cursor } = {}) =>
      cursor === 'c-2' ? page(rest) : { data: [first], page: { nextCursor: 'c-2', hasNext: true } },
    );
    await renderScreen();
    await screen.findByText('겨울 여행 투표가 시작됐어요');
    expect(screen.queryByText('지호님이 팔로우를 요청했어요')).toBeNull();
    const list = screen.getByTestId('notification-list');
    // 목록이 화면보다 짧다는 크기를 먼저 알려 준 뒤 끝까지 내린다
    await act(async () => {
      fireEvent(list, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 700 } },
      });
      fireEvent(list, 'contentSizeChange', 375, 500);
      fireEvent.scroll(list, {
        nativeEvent: {
          contentOffset: { x: 0, y: 400 },
          contentSize: { width: 375, height: 500 },
          layoutMeasurement: { width: 375, height: 700 },
        },
      });
    });
    expect(await screen.findByText('지호님이 팔로우를 요청했어요')).toBeTruthy();
    expect(mockList).toHaveBeenLastCalledWith({ cursor: 'c-2' });
  });
});
