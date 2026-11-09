import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { toast } from '@/components/ui';
import { getSavedPlaces, putMySave } from '@/features/group-favorites/api';
import { page, place as groupPlace, sampleSaved, saved } from '@/features/group-favorites/testing';

import { getRecommendation, requestRecommendation } from '../api';
import { result } from '../testing';

import { RecommendScreen } from './recommend-screen';

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

jest.mock('../api', () => ({ requestRecommendation: jest.fn(), getRecommendation: jest.fn() }));
jest.mock('@/features/group-favorites/api', () => ({
  PAGE_LIMIT: 20,
  getSavedPlaces: jest.fn(),
  putMySave: jest.fn(),
  patchMyMemo: jest.fn(),
  deleteMySave: jest.fn(),
}));

jest.mock('@/features/trip/hooks/use-trip', () => ({
  tripKey: (id: string) => ['trips', id],
  useTrip: () => ({
    data: {
      id: 'trip-1',
      title: '겨울 여행',
      startDate: '2026-11-14',
      endDate: '2026-11-15',
      destinationRegionIds: ['region-busan'],
      members: [
        { id: 'm-seeun', status: 'ACTIVE', user: { id: 'u-seeun', nickname: '세은' } },
        { id: 'm-seung', status: 'ACTIVE', user: { id: 'u-seung', nickname: '승기' } },
        { id: 'm-me', status: 'ACTIVE', user: { id: 'u-me', nickname: '영광' } },
      ],
    },
    error: null,
  }),
}));
jest.mock('@/features/trip/hooks/use-region-names', () => ({
  useRegions: (ids: string[]) => ({
    regions: ids.map((id) => ({ id, name: '부산광역시' })),
    ready: true,
  }),
}));
jest.mock('@/hooks/use-me', () => ({ useMe: () => ({ data: { id: 'u-me' } }) }));

jest.mock('@/components/ui', () => {
  const actual = jest.requireActual<typeof import('@/components/ui/icon')>('@/components/ui/icon');
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Icon: actual.Icon,
    Chip: ({ label, onPress }: { label: string; onPress?: () => void }) => (
      <Pressable onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
    Header: ({ title }: { title?: string }) => (
      <View>
        <Text>{title}</Text>
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

jest.setTimeout(20_000);

const mockRequest = jest.mocked(requestRecommendation);
const mockGet = jest.mocked(getRecommendation);
const mockList = jest.mocked(getSavedPlaces);
const mockPut = jest.mocked(putMySave);

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
        <RecommendScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequest.mockReset();
  mockGet.mockReset();
  mockRequest.mockResolvedValue({ jobId: 'job-1', status: 'QUEUED', statusUrl: '' });
  mockGet.mockResolvedValue(result());
  mockList.mockResolvedValue(page(sampleSaved()));
  mockPut.mockResolvedValue(saved(groupPlace('x', 'X'), ['m-me']));
});

describe('S21 추천 결과', () => {
  it('끝나기 전에는 생성 중 단계를 보인다', async () => {
    mockGet.mockResolvedValue(result({ status: 'RUNNING', progress: 10 }));
    await renderScreen();
    expect(await screen.findByText('추천을 만들고 있어요')).toBeTruthy();
    expect(screen.getByText('보통 10초 안에 끝나요')).toBeTruthy();
    expect(await screen.findByText('모은 장소 5곳 살펴보기')).toBeTruthy();
    expect(screen.getByText('세 사람 취향 맞춰 보기')).toBeTruthy();
    expect(screen.getByText('여행지와 장소 고르기')).toBeTruthy();
  });

  it('성공하면 묶음 칩, 이번 추천에 쓴 것, 여행지와 맛집 카드를 보인다', async () => {
    await renderScreen();
    expect(await screen.findByText('여행지 2')).toBeTruthy();
    expect(screen.getByText('맛집과 스팟 3')).toBeTruthy();
    expect(screen.getByText('이번 추천에 쓴 것')).toBeTruthy();
    expect(screen.getByText(' 겹침 3')).toBeTruthy();
    expect(screen.getByText('3명')).toBeTruthy();
    expect(screen.getByText('부산')).toBeTruthy();
    expect(screen.getByText('11.14 – 11.15')).toBeTruthy();
    expect(screen.getByText('개인 즐겨찾기와 비공개 취향은 쓰지 않았어요')).toBeTruthy();
    expect(screen.getByText('영도 흰여울 일대')).toBeTruthy();
    expect(screen.getByText('겹친 장소 흰여울문화마을이 있는 동네예요')).toBeTruthy();
    expect(screen.getByText('자갈치 회 골목')).toBeTruthy();
    expect(screen.getByText('부산 중구')).toBeTruthy();
    expect(screen.getAllByText('투표 후보로')).toHaveLength(2);
    expect(screen.getAllByText('담기')).toHaveLength(3);
    expect(mockGet).toHaveBeenCalledWith('trip-1', 'job-1');
  });

  it('묶음 칩을 누르면 그 묶음으로 간다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByText('맛집과 스팟 3'));
    expect(screen.getByTestId('recommend-list')).toBeTruthy();
    expect(toast.show).not.toHaveBeenCalled();
  });
});
