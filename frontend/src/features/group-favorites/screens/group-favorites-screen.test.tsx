import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getSavedPlaces } from '../api';
import { page, place, sampleSaved, saved } from '../testing';

import { GroupFavoritesScreen } from './group-favorites-screen';

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

jest.mock('../api', () => ({
  PAGE_LIMIT: 20,
  getSavedPlaces: jest.fn(),
  putMySave: jest.fn(),
  patchMyMemo: jest.fn(),
  deleteMySave: jest.fn(),
  getCoursePlaces: jest.fn(),
}));

jest.mock('@/features/saved/api', () => ({ getAllBookmarks: jest.fn() }));
jest.mock('@/features/place/place-picker', () => ({ pickPlace: jest.fn() }));

jest.mock('@/features/trip/hooks/use-trip', () => ({
  tripKey: (id: string) => ['trips', id],
  useTrip: () => ({
    data: {
      id: 'trip-1',
      title: '겨울 여행',
      members: [
        { id: 'm-seeun', status: 'ACTIVE', user: { id: 'u-seeun', nickname: '세은' } },
        { id: 'm-seung', status: 'ACTIVE', user: { id: 'u-seung', nickname: '승기' } },
        { id: 'm-me', status: 'ACTIVE', user: { id: 'u-me', nickname: '영광' } },
      ],
    },
    error: null,
  }),
}));

jest.mock('@/hooks/use-me', () => ({ useMe: () => ({ data: { id: 'u-me' } }) }));

jest.mock('@/components/map', () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MapView: ({ children }: { children?: ReactNode }) => <View>{children}</View>,
    MapMarker: ({
      accessibilityLabel,
      onPress,
    }: {
      accessibilityLabel?: string;
      onPress?: () => void;
    }) => (
      <Pressable onPress={onPress} accessibilityLabel={accessibilityLabel}>
        <Text>핀</Text>
      </Pressable>
    ),
  };
});

jest.mock('@/components/ui', () => {
  const actual = jest.requireActual<typeof import('@/components/ui/icon')>('@/components/ui/icon');
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Icon: actual.Icon,
    Tag: ({ label }: { label: string }) => <Text>{label}</Text>,
    Chip: ({ label, onPress }: { label: string; onPress?: () => void }) => (
      <Pressable onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
    Header: ({ title, right }: { title?: string; right?: ReactNode }) => (
      <View>
        <Text>{title}</Text>
        {right}
      </View>
    ),
    Avatar: () => null,
    AvatarGroup: () => null,
    ErrorState: ({ title }: { title?: string }) => <Text>{title}</Text>,
    BottomSheet: ({
      visible,
      title,
      children,
    }: {
      visible: boolean;
      title?: string;
      children?: ReactNode;
    }) =>
      visible ? (
        <View>
          <Text>{title}</Text>
          {children}
        </View>
      ) : null,
    toast: { show: jest.fn(), success: jest.fn(), error: jest.fn() },
  };
});

jest.setTimeout(20_000);

const mockList = jest.mocked(getSavedPlaces);

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
        <GroupFavoritesScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockReset();
  mockList.mockResolvedValue(page(sampleSaved()));
});

describe('모은 장소 보기', () => {
  it('필터 칩 수, 최근 담은 순, 담은 사람과 겹침을 보인다', async () => {
    await renderScreen();
    expect(await screen.findByText('해운대 해변')).toBeTruthy();
    expect(screen.getByText('전체 5')).toBeTruthy();
    expect(screen.getByText('겹친 곳 3')).toBeTruthy();
    expect(screen.getByText('최근 담은 순')).toBeTruthy();
    expect(screen.getByText('세은, 승기')).toBeTruthy();
    expect(screen.getAllByText('겹침 2명')).toHaveLength(3);
    expect(screen.getAllByText('부산 해운대구').length).toBeGreaterThan(0);
  });

  it('겹친 곳을 누르면 겹친 곳만 다시 받는다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByText('겹친 곳 3'));
    await waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith(
        'trip-1',
        { filter: 'OVERLAP', memberId: null },
        null,
        expect.anything(),
      ),
    );
  });

  it('동행을 고르면 그 사람이 담은 곳만 받는다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('동행별로 보기'));
    expect(screen.getByText('누가 담은 곳을 볼까요?')).toBeTruthy();
    // 목록 줄에도 세은이 있어 시트의 마지막 것을 누른다
    await fireEvent.press(screen.getAllByText('세은').at(-1)!);
    await waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith(
        'trip-1',
        { filter: 'ALL', memberId: 'm-seeun' },
        null,
        expect.anything(),
      ),
    );
  });

  it('끝까지 내리면 다음 쪽을 이어 받는다', async () => {
    mockList
      .mockResolvedValueOnce(
        page(sampleSaved().slice(0, 2), { page: { nextCursor: 'c2', hasNext: true } }),
      )
      .mockResolvedValueOnce(page([saved(place('p-next', '다대포 해수욕장'), ['m-seeun'])]));
    await renderScreen();
    await screen.findByText('해운대 해변');
    await fireEvent(screen.getByTestId('favorites-list'), 'onEndReached');
    expect(await screen.findByText('다대포 해수욕장')).toBeTruthy();
    expect(mockList.mock.calls[1][2]).toBe('c2');
  });

  it('지도로 바꾸고 핀을 누르면 아래에 장소 카드가 보인다', async () => {
    await renderScreen();
    await screen.findByText('해운대 해변');
    await fireEvent.press(screen.getByLabelText('지도로 보기'));
    expect(screen.queryByText('최근 담은 순')).toBeNull();
    await fireEvent.press(screen.getByLabelText('감천문화마을, 2명이 담았어요'));
    expect(screen.getByText('감천문화마을')).toBeTruthy();
    expect(screen.getByText('승기, 영광')).toBeTruthy();
  });

  it('목록을 받지 못하면 오류를 보인다', async () => {
    mockList.mockRejectedValue(new Error('network'));
    await renderScreen();
    expect(
      await screen.findByText('그룹 즐겨찾기를 불러오지 못했어요', {}, { timeout: 4000 }),
    ).toBeTruthy();
  });
});
