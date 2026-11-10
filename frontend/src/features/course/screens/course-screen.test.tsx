import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { toast } from '@/components/ui';

import { getItinerary, getJob, recalculateRoutes } from '../api';
import { itinerary, sampleCourse } from '../testing';

import { CourseScreen } from './course-screen';

const mockParams = { tripId: 'trip-1' };
const mockRouter = { replace: jest.fn(), back: jest.fn(), push: jest.fn() };

// 경로 계산이 생긴 뒤의 실패 화면도 확인할 수 있게 시간 없는 구간을 보이는 방식을 바꿔 끼운다
let mockNoTime: 'pending' | 'failed' = 'pending';
jest.mock('../course-rules', () => {
  const actual = jest.requireActual<Record<string, unknown>>('../course-rules');
  return {
    ...actual,
    noTimeDefault: () => mockNoTime,
  };
});
jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  // jest.mock은 위로 끌어올려져 mockRouter가 만들어지기 전에 불릴 수 있어 꺼낼 때 읽는다
  get router() {
    return mockRouter;
  },
}));

jest.mock('../api', () => ({
  getItinerary: jest.fn(),
  recalculateRoutes: jest.fn(),
  getJob: jest.fn(),
}));

jest.mock('@/features/trip/hooks/use-trip', () => ({
  tripKey: (id: string) => ['trips', id],
  useTrip: () => ({
    data: {
      id: 'trip-1',
      title: '겨울 여행',
      startDate: '2026-11-14',
      endDate: '2026-11-15',
      members: [
        { id: 'm-me', status: 'ACTIVE', user: { id: 'u-me', nickname: '영광' } },
        { id: 'm-seeun', status: 'ACTIVE', user: { id: 'u-seeun', nickname: '세은' } },
      ],
    },
    error: null,
  }),
}));

jest.mock('@/hooks/use-me', () => ({ useMe: () => ({ data: { id: 'u-me' } }) }));

// 지도는 네이티브 모듈이라 테스트에서는 아이들만 그린다
jest.mock('@/components/map', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MapView: ({ children }: { children?: ReactNode }) => <View>{children}</View>,
    MapMarker: () => null,
  };
});
jest.mock('../components/route-path', () => ({ RoutePath: () => null }));

jest.mock('@/components/ui', () => {
  const actual = jest.requireActual<typeof import('@/components/ui/icon')>('@/components/ui/icon');
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Icon: actual.Icon,
    Tag: ({ label }: { label: string }) => <Text>{label}</Text>,
    Header: ({ title }: { title?: string }) => <Text>{title}</Text>,
    AvatarGroup: () => null,
    ErrorState: ({
      title,
      retryLabel,
      onRetry,
    }: {
      title?: string;
      retryLabel?: string;
      onRetry?: () => void;
    }) => (
      <View>
        <Text>{title}</Text>
        <Pressable onPress={onRetry}>
          <Text>{retryLabel ?? '다시 시도'}</Text>
        </Pressable>
      </View>
    ),
    toast: { show: jest.fn(), success: jest.fn(), error: jest.fn() },
  };
});

jest.setTimeout(20_000);

const mockGet = jest.mocked(getItinerary);
const mockRecalc = jest.mocked(recalculateRoutes);
const mockJob = jest.mocked(getJob);

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
        <CourseScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockNoTime = 'pending';
  jest.clearAllMocks();
  mockGet.mockResolvedValue(sampleCourse(true));
});

describe('S24 코스', () => {
  it('지도 표시, 일차 탭, 고친 사람, 장소와 구간 시간을 보인다', async () => {
    await renderScreen();
    expect(await screen.findByText('해운대 해변')).toBeTruthy();
    expect(screen.getByText('저장됨')).toBeTruthy();
    expect(screen.getByText('1일차')).toBeTruthy();
    expect(screen.getByText('11.14(토)')).toBeTruthy();
    expect(screen.getByText('10.26(월) 세은님이 마지막으로 고쳤어요')).toBeTruthy();
    expect(screen.getByText('대중교통 22분')).toBeTruthy();
    expect(screen.getByText('10:00')).toBeTruthy();
    expect(screen.queryByText('이동 시간을 새로 구하지 못했어요')).toBeNull();
  });

  it('다른 일차를 누르면 그 날 장소로 바뀐다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByText('2일차'));
    expect(screen.getByText('감천문화마을')).toBeTruthy();
    expect(screen.queryByText('해운대 해변')).toBeNull();
  });

  it('편집을 누르면 코스 짜기로 간다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByText('편집'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/trips/[tripId]/course/edit',
      params: { tripId: 'trip-1' },
    });
  });

  it('경로 계산 전이면 실패 카드 없이 구간마다 계산 전으로 보인다', async () => {
    mockGet.mockResolvedValue(sampleCourse(false));
    await renderScreen();
    expect(await screen.findAllByText('대중교통 · 계산 전')).toHaveLength(2);
    expect(screen.queryByText('이동 시간을 새로 구하지 못했어요')).toBeNull();
    expect(screen.queryByText('다시 계산')).toBeNull();
  });

  it('구간 시간을 못 구했으면 카드를 보이고 다시 계산하면 코스를 다시 받는다', async () => {
    mockNoTime = 'failed';
    mockGet.mockResolvedValueOnce(sampleCourse(false));
    mockRecalc.mockResolvedValue({ jobId: 'job-1', status: 'QUEUED', statusUrl: '' });
    mockJob.mockResolvedValue({
      id: 'job-1',
      kind: 'ROUTE_RECALCULATION',
      status: 'SUCCEEDED',
      progress: 100,
      result: null,
      error: null,
      createdAt: '',
      finishedAt: '',
    });
    await renderScreen();
    expect(await screen.findByText('이동 시간을 새로 구하지 못했어요')).toBeTruthy();
    expect(screen.getAllByText('대중교통 · 시간 모름')).toHaveLength(2);
    await fireEvent.press(screen.getByText('다시 계산'));
    expect(mockRecalc).toHaveBeenCalledWith('trip-1', 3);
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('대중교통 22분')).toBeTruthy();
  });

  it('다시 계산 작업이 실패하면 안내한다', async () => {
    mockNoTime = 'failed';
    mockGet.mockResolvedValue(sampleCourse(false));
    mockRecalc.mockRejectedValue(new Error('network'));
    await renderScreen();
    await fireEvent.press(await screen.findByText('다시 계산'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('이동 시간을 다시 구하지 못했어요'),
    );
    expect(screen.getByText('이동 시간을 새로 구하지 못했어요')).toBeTruthy();
  });

  it('빼기는 아직 준비 중 안내를 띄운다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('해운대 해변 빼기'));
    expect(toast.show).toHaveBeenCalledWith('준비 중이에요');
  });

  it('코스가 비어 있으면 코스 짜기로 바꿔 연다', async () => {
    mockGet.mockResolvedValue(itinerary({ items: [], legs: [] }));
    await renderScreen();
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/trips/[tripId]/course/edit',
        params: { tripId: 'trip-1', entry: 'empty' },
      }),
    );
  });
});
