import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { toast } from '@/components/ui';
import { getItinerary } from '@/features/course/api';
import { itinerary, sampleCourse } from '@/features/course/testing';

import { getChecklistSummary, getWeather } from '../api';
import { weather } from '../testing';

import { OnTripScreen } from './on-trip-screen';

const mockParams = { tripId: 'trip-1' };
const mockRouter = { replace: jest.fn(), back: jest.fn(), push: jest.fn() };

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

jest.mock('@/features/course/api', () => ({ getItinerary: jest.fn() }));
jest.mock('../api', () => ({ getWeather: jest.fn(), getChecklistSummary: jest.fn() }));

const mockTrip = {
  id: 'trip-1',
  title: '겨울 여행',
  startDate: '2026-11-14' as string | null,
  endDate: '2026-11-15' as string | null,
  destinationRegionIds: ['region-busan'],
  members: [{ id: 'm-me', status: 'ACTIVE', user: { id: 'u-me', nickname: '영광' } }],
};
jest.mock('@/features/trip/hooks/use-trip', () => ({
  tripKey: (id: string) => ['trips', id],
  useTrip: () => ({ data: mockTrip, error: null, isError: false, refetch: jest.fn() }),
}));
jest.mock('@/hooks/use-me', () => ({ useMe: () => ({ data: { id: 'u-me' } }) }));
jest.mock('@/features/trip/hooks/use-region-names', () => ({
  useRegions: (ids: string[]) => ({
    regions: ids.map((id) => ({ id, name: '부산광역시' })),
    ready: true,
  }),
}));

jest.mock('@/components/ui', () => {
  const actual = jest.requireActual<typeof import('@/components/ui/icon')>('@/components/ui/icon');
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Icon: actual.Icon,
    Header: ({ title, subtitle }: { title?: string; subtitle?: string }) => (
      <View>
        <Text>{title}</Text>
        <Text>{subtitle}</Text>
      </View>
    ),
    AvatarGroup: () => null,
    ErrorState: ({ title }: { title?: string }) => <Text>{title}</Text>,
    Button: ({ label, onPress }: { label: string; onPress?: () => void; leading?: ReactNode }) => (
      <Pressable onPress={onPress} accessibilityRole="button">
        <Text>{label}</Text>
      </Pressable>
    ),
    toast: { show: jest.fn(), success: jest.fn(), error: jest.fn() },
  };
});

jest.setTimeout(20_000);

const mockItinerary = jest.mocked(getItinerary);
const mockWeather = jest.mocked(getWeather);
const mockChecklist = jest.mocked(getChecklistSummary);

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
        <OnTripScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-14T09:40:00'), advanceTimers: true });
  jest.clearAllMocks();
  mockTrip.startDate = '2026-11-14';
  mockTrip.endDate = '2026-11-15';
  mockItinerary.mockResolvedValue(sampleCourse(true));
  mockWeather.mockReset();
  mockWeather.mockResolvedValue(weather());
  mockChecklist.mockResolvedValue({ total: 6, checked: 3 });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('S25 여행 중', () => {
  it('오늘 날씨, 도구 칸, 오늘 코스와 다음 일정을 보인다', async () => {
    await renderScreen();
    expect(await screen.findByText('오전 비 70%')).toBeTruthy();
    // 머리 제목과 상태 알약에 두 번
    expect(screen.getAllByText('여행 중')).toHaveLength(2);
    expect(screen.getByText('1일차 · 11.14(토)')).toBeTruthy();
    expect(screen.getByText('지금 09:40')).toBeTruthy();
    expect(screen.getByText('12시부터 그쳐요 · 최고 14° 최저 9°')).toBeTruthy();
    expect(screen.getByText('09:40 조회')).toBeTruthy();
    expect(screen.getByText('10:00 해운대 해변 일정에 비가 와요')).toBeTruthy();
    expect(screen.getByText('비 70%')).toBeTruthy();
    expect(await screen.findByText('3/6 챙김')).toBeTruthy();
    expect(screen.getByText('오늘 코스')).toBeTruthy();
    expect(screen.getByText('다음')).toBeTruthy();
    expect(screen.getByText('광안리 바다뷰 카페')).toBeTruthy();
    expect(screen.getByText('대중교통 22분')).toBeTruthy();
    expect(screen.queryByText('감천문화마을')).toBeNull();
    expect(mockWeather).toHaveBeenCalledWith(
      'trip-1',
      '2026-11-14',
      'p-haeundae',
      expect.anything(),
    );
  });

  it('오늘 코스가 없으면 코스 짜러 가기와 날씨 안내', async () => {
    mockItinerary.mockResolvedValue(itinerary({ items: [], legs: [] }));
    await renderScreen();
    expect(await screen.findByText('저장한 코스가 없어요')).toBeTruthy();
    expect(screen.getByText('코스를 저장하면 날씨가 보여요')).toBeTruthy();
    await fireEvent.press(screen.getByText('코스 짜러 가기'));
    expect(mockRouter.push).toHaveBeenCalledWith('/trips/trip-1/course');
    expect(mockWeather).not.toHaveBeenCalled();
  });

  it('날씨를 받지 못하면 갱신 실패와 다시 시도', async () => {
    mockWeather.mockRejectedValueOnce(new Error('503'));
    await renderScreen();
    expect(await screen.findByText('날씨를 새로 불러오지 못했어요')).toBeTruthy();
    await fireEvent.press(screen.getByText('다시 시도'));
    expect(await screen.findByText('오전 비 70%')).toBeTruthy();
  });

  it('날씨 대안, 준비물, 편의시설로 간다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByText('날씨 대안 보기'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/trips/[tripId]/weather',
      params: { tripId: 'trip-1', date: '2026-11-14', placeId: 'p-haeundae' },
    });
    await fireEvent.press(await screen.findByLabelText('준비물, 3/6 챙김'));
    expect(mockRouter.push).toHaveBeenCalledWith('/trips/trip-1/checklist');
    await fireEvent.press(screen.getByLabelText('주변 편의시설, 코스 근처'));
    expect(toast.show).toHaveBeenCalledWith('준비 중이에요');
  });

  it('준비물 수를 받지 못하면 목록 보기', async () => {
    mockChecklist.mockRejectedValue(new Error('404'));
    await renderScreen();
    await waitFor(() => expect(screen.getByText('목록 보기')).toBeTruthy());
  });
});

describe('여행 시작 전', () => {
  it('남은 날, 바뀌는 날, 날짜별 예보와 준비물 진행', async () => {
    jest.setSystemTime(new Date('2026-11-12T21:00:00'));
    mockWeather.mockImplementation(async (_trip, date, placeId) => ({
      ...weather(),
      date,
      placeId,
      queriedAt: '2026-11-12T21:00:00',
    }));
    await renderScreen();
    expect(await screen.findByText('계획 중')).toBeTruthy();
    expect(screen.getByText('여행까지 2일 남았어요')).toBeTruthy();
    expect(screen.getByText('11.14(토)부터 여행 중으로 바뀌어요')).toBeTruthy();
    expect(await screen.findByText('부산 날씨 예보')).toBeTruthy();
    expect(screen.getByText('11.12(목) 21:00 조회')).toBeTruthy();
    expect(screen.getAllByText('비 70%')).toHaveLength(2);
    expect(screen.getByText('11.15(일)')).toBeTruthy();
    expect(screen.getByText('전날 다시 알려요')).toBeTruthy();
    expect(await screen.findByText('6개 중 3개 챙겼어요')).toBeTruthy();
    expect(mockWeather).toHaveBeenCalledWith(
      'trip-1',
      '2026-11-15',
      'p-gamcheon',
      expect.anything(),
    );
    expect(screen.queryByText('오늘 코스')).toBeNull();
    await fireEvent.press(screen.getByLabelText('준비물'));
    expect(mockRouter.push).toHaveBeenCalledWith('/trips/trip-1/checklist');
  });

  it('날짜가 없으면 날짜를 정하라는 안내와 준비물만', async () => {
    mockTrip.startDate = null;
    mockTrip.endDate = null;
    await renderScreen();
    expect(await screen.findByText('여행 날짜를 정하면 여행 중으로 바뀌어요')).toBeTruthy();
    expect(screen.queryByText('부산 날씨 예보')).toBeNull();
    expect(mockWeather).not.toHaveBeenCalled();
  });
});
