import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { toast } from '@/components/ui';
import { pickPlace } from '@/features/place/place-picker';

import { updateTrip } from '@/features/trip/api';

import {
  getAutoCourse,
  getItinerary,
  getJob,
  getTripSavedPlaces,
  recalculateRoutes,
  replaceItinerary,
  requestAutoCourse,
} from '../api';
import { httpError, item, itinerary, place, sampleCourse, savedPlace } from '../testing';
import type { Itinerary, ItineraryProposal, ItineraryWrite } from '../types';

import { CourseEditScreen } from './course-edit-screen';

const mockParams: { tripId: string; entry?: string; split?: string } = { tripId: 'trip-1' };
const mockRouter = {
  replace: jest.fn(),
  back: jest.fn(),
  push: jest.fn(),
  canGoBack: jest.fn(() => true),
};

jest.mock('expo-crypto', () => ({ randomUUID: () => 'key-1' }));
jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));

const mockPreventRemove = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  usePreventRemove: (...args: unknown[]) => mockPreventRemove(...args),
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

const mockRegionNames: Record<string, string> = {
  'region-busan': '부산광역시',
  'region-gangneung': '강원특별자치도 강릉시',
};
jest.mock('@/features/trip/hooks/use-region-names', () => ({
  useRegions: (ids: string[]) => ({
    regions: ids.map((id) => ({ id, name: mockRegionNames[id] ?? id })),
    ready: true,
  }),
}));
jest.mock('@/features/trip/api', () => ({ updateTrip: jest.fn() }));
jest.mock('@/features/trip/hooks/trip-cache', () => ({ invalidateTripLists: jest.fn() }));

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
    Button: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress?: () => void;
      disabled?: boolean;
    }) => (
      <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button">
        <Text>{label}</Text>
      </Pressable>
    ),
    Chip: ({ label, onPress }: { label: string; onPress?: () => void }) => (
      <Pressable onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
    toast: { show: jest.fn(), success: jest.fn(), error: jest.fn() },
  };
});

// 달력은 테스트에서 그리지 않는다. 칩으로 기간을 고른다
jest.mock('react-native-calendars', () => ({
  Calendar: () => null,
  LocaleConfig: { locales: {}, defaultLocale: '' },
}));

jest.setTimeout(20_000);

const mockGet = jest.mocked(getItinerary);
const mockPut = jest.mocked(replaceItinerary);
const mockPick = jest.mocked(pickPlace);
const mockSaved = jest.mocked(getTripSavedPlaces);
const mockRequestAuto = jest.mocked(requestAutoCourse);
const mockGetAuto = jest.mocked(getAutoCourse);
const mockUpdateTrip = jest.mocked(updateTrip);
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
  mockParams.split = undefined;
  mockTrip.startDate = '2026-11-14';
  mockTrip.endDate = '2026-11-15';
  mockTrip.destinationRegionIds = ['region-busan'];
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

describe('다른 길로 나가기', () => {
  it('고친 것이 있으면 뒤로 버튼이나 쓸어 나가기도 막고 버릴지 묻는다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('해운대 해변 고치기'));
    await fireEvent.press(screen.getByText('코스에서 빼기'));
    const [prevent, onPrevent] = mockPreventRemove.mock.calls.at(-1) as [boolean, () => void];
    expect(prevent).toBe(true);
    await act(async () => onPrevent());
    expect(screen.getByText('고친 내용을 버릴까요?')).toBeTruthy();
    await fireEvent.press(screen.getByText('버리고 나가기'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(mockPreventRemove.mock.calls.at(-1)?.[0]).toBe(false);
  });

  it('고친 것이 없으면 막지 않는다', async () => {
    await renderScreen();
    await screen.findByText('해운대 해변');
    expect(mockPreventRemove.mock.calls.at(-1)?.[0]).toBe(false);
  });
});

describe('직접 만들기', () => {
  const haeundae = place('p-haeundae', '해운대 해변');
  const gwangalli = place('p-gwangalli', '광안리 바다뷰 카페');
  const seomyeon = place('p-seomyeon', '서면 돼지국밥집');

  /** 빈 코스는 구성 방식 선택부터 열린다 */
  async function openManual() {
    await renderScreen();
    await fireEvent.press(await screen.findByText('직접 만들기'));
  }

  beforeEach(() => {
    mockGet.mockResolvedValue(itinerary({ version: 1, items: [], legs: [] }));
    mockSaved.mockResolvedValue([
      savedPlace(haeundae),
      savedPlace(gwangalli),
      savedPlace(seomyeon),
    ]);
  });

  it('날짜를 고르고 칩을 누르면 그 날 끝에 놓이고 코스 만들기로 초안이 된다', async () => {
    await openManual();
    expect(await screen.findByText('날짜를 고르고 그룹 즐겨찾기 장소를 눌러 놓아요')).toBeTruthy();
    expect(await screen.findByText('3곳 남았어요')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('해운대 해변, 1일차에 놓기'));
    await fireEvent.press(screen.getByLabelText('광안리 바다뷰 카페, 1일차에 놓기'));
    expect(screen.getByText('1곳 남았어요')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('2일차에 놓기'));
    await fireEvent.press(screen.getByLabelText('서면 돼지국밥집, 2일차에 놓기'));
    await fireEvent.press(screen.getByText('코스 만들기'));

    expect(await screen.findByText('재추천')).toBeTruthy();
    await fireEvent.press(screen.getByText('완료'));
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    const body = lastBody();
    expect(body.expectedVersion).toBe(1);
    expect(day1(body)).toEqual(['p-haeundae', 'p-gwangalli']);
    expect(body.items.filter((i) => i.day === 2).map((i) => i.placeId)).toEqual(['p-seomyeon']);
    expect(body.legs).toEqual([{ day: 1, fromOrder: 1, toOrder: 2, transportMode: 'TRANSIT' }]);
  });

  it('놓은 장소가 없으면 코스 만들기를 누를 수 없다', async () => {
    await openManual();
    await fireEvent.press(await screen.findByText('코스 만들기'));
    expect(screen.queryByText('재추천')).toBeNull();
  });

  it('놓은 장소를 빼면 칩 줄로 돌아온다', async () => {
    await openManual();
    await fireEvent.press(await screen.findByLabelText('해운대 해변, 1일차에 놓기'));
    await fireEvent.press(screen.getByLabelText('해운대 해변 고치기'));
    await fireEvent.press(screen.getByText('코스에서 빼기'));
    expect(screen.getByText('3곳 남았어요')).toBeTruthy();
  });

  it('그룹 즐겨찾기가 비었으면 장소 찾기로 고른 장소를 놓는다', async () => {
    mockSaved.mockResolvedValue([]);
    mockPick.mockResolvedValue(place('p-new', '흰여울문화마을'));
    await openManual();
    expect(await screen.findByText('그룹 즐겨찾기가 비어 있어요')).toBeTruthy();
    await fireEvent.press(screen.getByText('장소 찾기'));
    expect(await screen.findByText('흰여울문화마을')).toBeTruthy();
  });
});

describe('구성 방식과 준비 상태', () => {
  const proposalOf = (status: 'SUCCEEDED' | 'FAILED'): ItineraryProposal => ({
    job: {
      id: 'job-1',
      kind: 'ITINERARY_PROPOSAL',
      status,
      progress: 100,
      result: null,
      error: null,
      createdAt: '',
      finishedAt: '',
    },
    baseVersion: 1,
    reason: 'INITIAL',
    proposed:
      status === 'SUCCEEDED'
        ? {
            items: [
              {
                day: 1,
                order: 1,
                place: place('p-a', '추천 장소 A'),
                startTime: '10:00',
                stayMinutes: 60,
              },
              {
                day: 1,
                order: 2,
                place: place('p-b', '추천 장소 B'),
                startTime: '13:00',
                stayMinutes: 60,
              },
            ],
            legs: [{ day: 1, fromOrder: 1, toOrder: 2, transportMode: 'CAR' }],
          }
        : null,
    diff: null,
    appliedAt: null,
    canUndo: false,
  });

  beforeEach(() => {
    mockGet.mockResolvedValue(itinerary({ version: 1, items: [], legs: [] }));
    mockSaved.mockResolvedValue([savedPlace(place('a', 'A')), savedPlace(place('b', 'B'))]);
    mockRequestAuto.mockResolvedValue({ jobId: 'job-1', status: 'QUEUED', statusUrl: '' });
  });

  it('여행지와 기간이 있으면 구성 방식 선택을 보인다', async () => {
    await renderScreen();
    expect(await screen.findByText('이 내용으로 짜요')).toBeTruthy();
    expect(screen.getByText('여행지 부산')).toBeTruthy();
    expect(screen.getByText('기간 11.14(토) – 11.15(일)')).toBeTruthy();
    expect(await screen.findByText('모은 장소 2곳')).toBeTruthy();
    expect(screen.getByText('어떻게 짤까요?')).toBeTruthy();
  });

  it('여행지가 없으면 여행지를 먼저 정하게 한다', async () => {
    mockTrip.destinationRegionIds = [];
    await renderScreen();
    expect(await screen.findByText('여행지를 먼저 정해요')).toBeTruthy();
    await fireEvent.press(screen.getByText('여행지 정하기'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/trips/[tripId]/settings-region',
      params: { tripId: 'trip-1' },
    });
  });

  it('기간이 없으면 기간을 고르고 다음에서 여행 기간을 저장한다', async () => {
    mockTrip.startDate = null;
    mockTrip.endDate = null;
    mockUpdateTrip.mockResolvedValue({} as never);
    await renderScreen();
    expect(await screen.findByText('언제 가요?')).toBeTruthy();
    await fireEvent.press(screen.getByText('1박 2일'));
    await fireEvent.press(screen.getByText('다음'));
    await waitFor(() => expect(mockUpdateTrip).toHaveBeenCalled());
    const [, body] = mockUpdateTrip.mock.calls[0];
    expect(body.expectedVersion).toBe(1);
    expect(Date.parse(body.endDate as string) - Date.parse(body.startDate as string)).toBe(
      86_400_000,
    );
  });

  it('자동 추천이 끝나면 추천안 초안을 열고 완료로 저장한다', async () => {
    mockGetAuto.mockResolvedValue(proposalOf('SUCCEEDED'));
    await renderScreen();
    await fireEvent.press(await screen.findByText('자동 추천'));
    expect(await screen.findByText('추천안')).toBeTruthy();
    expect(screen.getByText('추천 장소 A')).toBeTruthy();
    // 추천안 구간은 아직 구한 적이 없어 저장된 코스의 기준 시각을 붙이지 않는다
    expect(screen.getByText('구간을 누르면 이동 수단을 바꿔요')).toBeTruthy();
    await fireEvent.press(screen.getByText('완료'));
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    expect(lastBody().items.every((i) => !('id' in i))).toBe(true);
    expect(lastBody().legs).toEqual([{ day: 1, fromOrder: 1, toOrder: 2, transportMode: 'CAR' }]);
  });

  it('자동 추천이 실패하면 다시 시도와 직접 만들기를 보인다', async () => {
    mockGetAuto.mockResolvedValue(proposalOf('FAILED'));
    await renderScreen();
    await fireEvent.press(await screen.findByText('자동 추천'));
    expect(await screen.findByText('코스를 만들지 못했어요')).toBeTruthy();
    await fireEvent.press(screen.getByText('직접 만들기'));
    expect(await screen.findByText('날짜를 고르고 그룹 즐겨찾기 장소를 눌러 놓아요')).toBeTruthy();
  });

  it('요청이 바로 실패하면 생성 중 화면을 거치지 않고, 다시 시도해도 실패 화면에 머문다', async () => {
    mockRequestAuto.mockRejectedValue(new Error('404'));
    await renderScreen();
    await fireEvent.press(await screen.findByText('자동 추천'));
    // 서버가 받기 전에는 선택 화면을 그대로 둔다
    expect(screen.getByText('이 내용으로 짜요')).toBeTruthy();
    expect(screen.queryByText('코스를 짜고 있어요')).toBeNull();
    expect(await screen.findByText('코스를 만들지 못했어요')).toBeTruthy();
    await fireEvent.press(screen.getByText('다시 시도'));
    expect(screen.getByText('코스를 만들지 못했어요')).toBeTruthy();
    expect(screen.queryByText('코스를 짜고 있어요')).toBeNull();
    await waitFor(() => expect(mockRequestAuto).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('다시 시도')).toBeTruthy());
    expect(screen.queryByText('코스를 짜고 있어요')).toBeNull();
  });

  it('추천안에서 뒤로 가면 버릴지 묻는다', async () => {
    mockGetAuto.mockResolvedValue(proposalOf('SUCCEEDED'));
    await renderScreen();
    await fireEvent.press(await screen.findByText('자동 추천'));
    await screen.findByText('추천안');
    await fireEvent.press(screen.getByLabelText('뒤로'));
    expect(screen.getByText('고친 내용을 버릴까요?')).toBeTruthy();
  });

  it('초안의 재추천이 실패하면 고치던 코스로 돌아갈 수 있다', async () => {
    mockGet.mockResolvedValue(sampleCourse(true));
    mockGetAuto.mockResolvedValue(proposalOf('FAILED'));
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('해운대 해변 고치기'));
    await fireEvent.press(screen.getByLabelText('아래로'));
    await fireEvent.press(screen.getByText('재추천'));
    expect(await screen.findByText('고치던 코스로 돌아가기')).toBeTruthy();
    expect(screen.queryByText('직접 만들기')).toBeNull();
    await fireEvent.press(screen.getByText('고치던 코스로 돌아가기'));
    expect(await screen.findByText('고치는 중')).toBeTruthy();
    await fireEvent.press(screen.getByText('완료'));
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    expect(day1(lastBody())).toEqual(['p-gwangalli', 'p-haeundae', 'p-seomyeon']);
  });

  it('초안의 재추천은 새 추천안으로 바꾼다', async () => {
    mockGet.mockResolvedValue(sampleCourse(true));
    mockGetAuto.mockResolvedValue(proposalOf('SUCCEEDED'));
    await renderScreen();
    await fireEvent.press(await screen.findByText('재추천'));
    expect(await screen.findByText('추천 장소 A')).toBeTruthy();
    expect(mockRequestAuto).toHaveBeenCalledWith('trip-1', 3, expect.any(String));
  });
});

describe('이동 시간 계산 불가', () => {
  beforeEach(() => {
    mockGet.mockResolvedValue(sampleCourse(false));
  });

  it('구간 시간이 없으면 0분으로 채우지 않고 경고와 다시 계산을 보인다', async () => {
    await renderScreen();
    expect(await screen.findByText('두 곳 사이 경로를 찾지 못했어요')).toBeTruthy();
    expect(screen.getAllByText('이동 시간을 못 구했어요')).toHaveLength(2);
    expect(screen.getByText('이동 수단을 바꿔 보세요')).toBeTruthy();
    expect(screen.queryByText(/0분/)).toBeNull();
  });

  it('저장된 코스면 다시 계산을 요청하고 끝나면 시간을 보인다', async () => {
    mockRecalc.mockResolvedValue({ jobId: 'job-r', status: 'QUEUED', statusUrl: '' });
    mockJob.mockResolvedValue({
      id: 'job-r',
      kind: 'ROUTE_RECALCULATION',
      status: 'SUCCEEDED',
      progress: 100,
      result: null,
      error: null,
      createdAt: '',
      finishedAt: '',
    });
    await renderScreen();
    await screen.findByText('두 곳 사이 경로를 찾지 못했어요');
    mockGet.mockResolvedValue(sampleCourse(true));
    await fireEvent.press(screen.getAllByText('다시 계산')[0]);
    expect(mockRecalc).toHaveBeenCalledWith('trip-1', 3);
    expect(await screen.findByText('대중교통 22분')).toBeTruthy();
    expect(screen.queryByText('두 곳 사이 경로를 찾지 못했어요')).toBeNull();
  });

  it('고친 초안이면 저장한 뒤 다시 계산하라고 안내한다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('서면 돼지국밥집 고치기'));
    await fireEvent.press(screen.getByLabelText('위로'));
    await fireEvent.press(screen.getAllByText('다시 계산')[0]);
    expect(mockRecalc).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('완료로 저장한 뒤 다시 계산할 수 있어요');
  });
});

describe('여러 지역 날짜별로 나누기', () => {
  beforeEach(() => {
    mockTrip.destinationRegionIds = ['region-busan', 'region-gangneung'];
  });

  it('여행지가 두 곳이면 날짜별 지역 줄을 보이고 고른 지역이 일차 탭에 붙는다', async () => {
    await renderScreen();
    expect(await screen.findByText('1일차 지역')).toBeTruthy();
    expect(screen.getByText('부산·강릉시 모두 정해졌어요. 날짜별로 지역을 골라요')).toBeTruthy();
    expect(screen.getByText('11.14(토) · 부산')).toBeTruthy();
    await fireEvent.press(screen.getByText('강릉시'));
    expect(screen.getByText('11.14(토) · 강릉시')).toBeTruthy();
  });

  it('여행지가 한 곳이면 지역 줄이 없다', async () => {
    mockTrip.destinationRegionIds = ['region-busan'];
    await renderScreen();
    await screen.findByText('해운대 해변');
    expect(screen.queryByText('1일차 지역')).toBeNull();
  });

  it('투표 동률에서 split으로 오면 빈 코스도 바로 날짜별 지역을 고르며 직접 만든다', async () => {
    mockParams.split = '1';
    mockGet.mockResolvedValue(itinerary({ version: 1, items: [], legs: [] }));
    mockSaved.mockResolvedValue([
      savedPlace(place('p-g', '안목 커피거리', { regionId: 'region-gangneung' })),
      savedPlace(place('p-b', '해운대 해변', { regionId: 'region-busan' })),
    ]);
    await renderScreen();
    expect(await screen.findByText('날짜를 고르고 그룹 즐겨찾기 장소를 눌러 놓아요')).toBeTruthy();
    expect(screen.getByText('1일차 지역')).toBeTruthy();
    expect(screen.queryByText('이 내용으로 짜요')).toBeNull();
  });
});
