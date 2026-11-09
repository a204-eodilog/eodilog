import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { toast } from '@/components/ui';
import { pickPlace } from '@/features/place/place-picker';

import { getItinerary, replaceItinerary } from '../api';
import { httpError, item, itinerary, place, sampleCourse } from '../testing';
import type { Itinerary, ItineraryWrite } from '../types';

import { CourseEditScreen } from './course-edit-screen';

const mockParams: { tripId: string; entry?: string } = { tripId: 'trip-1' };
const mockRouter = {
  replace: jest.fn(),
  back: jest.fn(),
  push: jest.fn(),
  canGoBack: jest.fn(() => true),
};

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
  replaceItinerary: jest.fn(),
  requestAutoCourse: jest.fn(),
  getAutoCourse: jest.fn(),
  recalculateRoutes: jest.fn(),
  getJob: jest.fn(),
  getTripSavedPlaces: jest.fn(),
}));

jest.mock('@/features/place/place-picker', () => ({ pickPlace: jest.fn() }));

const mockTrip = {
  id: 'trip-1',
  title: '겨울 여행',
  startDate: '2026-11-14' as string | null,
  endDate: '2026-11-15' as string | null,
  destinationRegionIds: ['region-busan'],
  version: 1,
  members: [{ id: 'm-me', status: 'ACTIVE', user: { id: 'u-me', nickname: '영광' } }],
};
jest.mock('@/features/trip/hooks/use-trip', () => ({
  tripKey: (id: string) => ['trips', id],
  useTrip: () => ({ data: mockTrip, error: null }),
}));

jest.mock('@/hooks/use-me', () => ({ useMe: () => ({ data: { id: 'u-me' } }) }));

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
    Header: ({ title, onBack }: { title?: string; onBack?: () => void }) => (
      <View>
        <Text>{title}</Text>
        <Pressable onPress={onBack} accessibilityLabel="뒤로">
          <Text>뒤로</Text>
        </Pressable>
      </View>
    ),
    AvatarGroup: () => null,
    ErrorState: ({ title }: { title?: string }) => <Text>{title}</Text>,
    BottomSheet: ({
      visible,
      title,
      description,
      children,
    }: {
      visible: boolean;
      title?: string;
      description?: string;
      children?: ReactNode;
    }) =>
      visible ? (
        <View>
          <Text>{title}</Text>
          <Text>{description}</Text>
          {children}
        </View>
      ) : null,
    ConfirmSheet: ({
      visible,
      title,
      confirmLabel,
      onConfirm,
    }: {
      visible: boolean;
      title: string;
      confirmLabel: string;
      onConfirm: () => void;
    }) =>
      visible ? (
        <View>
          <Text>{title}</Text>
          <Pressable onPress={onConfirm}>
            <Text>{confirmLabel}</Text>
          </Pressable>
        </View>
      ) : null,
    toast: { show: jest.fn(), success: jest.fn(), error: jest.fn() },
  };
});

jest.setTimeout(20_000);

const mockGet = jest.mocked(getItinerary);
const mockPut = jest.mocked(replaceItinerary);
const mockPick = jest.mocked(pickPlace);

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
        <CourseEditScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

/** 저장 요청에 서버가 받은 대로 저장한 것처럼 답한다 */
function echoPut() {
  mockPut.mockImplementation(async (_trip, body: ItineraryWrite): Promise<Itinerary> => {
    const base = sampleCourse(true);
    return itinerary({
      version: body.expectedVersion + 1,
      items: body.items.map((i, k) =>
        item(
          i.id ?? `new-${k}`,
          base.items.find((x) => x.place.id === i.placeId)?.place ?? place(i.placeId, '새 장소'),
          i.day,
          i.order,
        ),
      ),
    });
  });
}

const lastBody = () => mockPut.mock.calls.at(-1)?.[1] as ItineraryWrite;
const day1 = (b: ItineraryWrite) => b.items.filter((i) => i.day === 1).map((i) => i.placeId);

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.entry = undefined;
  mockGet.mockResolvedValue(sampleCourse(true));
  echoPut();
});

describe('코스 초안 고치고 저장하기', () => {
  it('지도, 일차 탭, 수단 칩, 안내, 장소와 구간이 보인다', async () => {
    await renderScreen();
    expect(await screen.findByText('해운대 해변')).toBeTruthy();
    expect(screen.getByText('대중교통')).toBeTruthy();
    expect(screen.getByText('자동차')).toBeTruthy();
    expect(
      screen.getByText('구간을 누르면 이동 수단을 바꿔요 · 10.26(월) 20:40 기준'),
    ).toBeTruthy();
    expect(screen.getByText('대중교통 22분')).toBeTruthy();
    expect(screen.getByText('재추천')).toBeTruthy();
  });

  it('장소를 위로 옮기고 완료하면 순서를 다시 매겨 저장하고 돌아간다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('광안리 바다뷰 카페 고치기'));
    expect(screen.getByText('1일차 2번째')).toBeTruthy();
    expect(screen.getByText('고치는 중')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('위로'));
    await fireEvent.press(screen.getByText('완료'));

    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    const body = lastBody();
    expect(body.expectedVersion).toBe(3);
    expect(day1(body)).toEqual(['p-gwangalli', 'p-haeundae', 'p-seomyeon']);
    expect(body.legs.filter((l) => l.day === 1)).toHaveLength(2);
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  });

  it('구간을 골라 수단을 바꾸면 그 구간만 바뀐다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByText('대중교통 25분'));
    await fireEvent.press(screen.getByText('자동차'));
    await fireEvent.press(screen.getByText('완료'));
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    expect(lastBody().legs.map((l) => l.transportMode)).toEqual(['TRANSIT', 'CAR']);
  });

  it('빼면 앞뒤 사이에 구간이 하나 남는다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('광안리 바다뷰 카페 고치기'));
    await fireEvent.press(screen.getByText('코스에서 빼기'));
    expect(screen.queryByText('광안리 바다뷰 카페')).toBeNull();
    await fireEvent.press(screen.getByText('완료'));
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    expect(day1(lastBody())).toEqual(['p-haeundae', 'p-seomyeon']);
    expect(lastBody().legs.filter((l) => l.day === 1)).toEqual([
      { day: 1, fromOrder: 1, toOrder: 2, transportMode: 'TRANSIT' },
    ]);
  });

  it('다른 장소로 바꾸면 고른 장소가 같은 자리에 새 항목으로 들어간다', async () => {
    mockPick.mockResolvedValue(place('p-new', '흰여울문화마을'));
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('서면 돼지국밥집 고치기'));
    await fireEvent.press(screen.getByText('다른 장소로 바꾸기'));
    expect(await screen.findByText('흰여울문화마을')).toBeTruthy();
    await fireEvent.press(screen.getByText('완료'));
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    const replaced = lastBody().items.find((i) => i.placeId === 'p-new');
    expect(replaced).toMatchObject({ day: 1, order: 3 });
    expect(replaced && 'id' in replaced).toBe(false);
  });

  it('바뀐 게 없으면 저장하지 않고 돌아간다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByText('완료'));
    expect(mockPut).not.toHaveBeenCalled();
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('완료를 두 번 빨리 눌러도 한 번만 저장한다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('해운대 해변 고치기'));
    await fireEvent.press(screen.getByLabelText('아래로'));
    await act(async () => {
      fireEvent.press(screen.getByText('완료'));
      fireEvent.press(screen.getByText('완료'));
    });
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(mockPut).toHaveBeenCalledTimes(1);
  });

  it('다른 동행이 먼저 저장했으면 덮어쓰지 않고 최신 코스로 다시 채운다', async () => {
    mockPut.mockRejectedValue(httpError(409, 'VERSION_CONFLICT'));
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('해운대 해변 고치기'));
    await fireEvent.press(screen.getByText('코스에서 빼기'));
    const latest = sampleCourse(true);
    latest.version = 4;
    mockGet.mockResolvedValue(latest);
    await fireEvent.press(screen.getByText('완료'));
    await waitFor(() =>
      expect(toast.show).toHaveBeenCalledWith(
        '다른 동행이 먼저 코스를 고쳤어요. 최신 코스를 불러왔어요',
      ),
    );
    expect(await screen.findByText('해운대 해변')).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('고친 것이 있으면 뒤로 갈 때 버릴지 묻는다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('해운대 해변 고치기'));
    await fireEvent.press(screen.getByText('코스에서 빼기'));
    await fireEvent.press(screen.getByLabelText('뒤로'));
    expect(screen.getByText('고친 내용을 버릴까요?')).toBeTruthy();
    await fireEvent.press(screen.getByText('버리고 나가기'));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('빈 코스에서 왔으면 저장 뒤 S24로 바꿔 간다', async () => {
    mockParams.entry = 'empty';
    await renderScreen();
    await fireEvent.press(await screen.findByText('완료'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/trips/trip-1/course');
  });
});
