import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { toast } from '@/components/ui';
import { pickPlace } from '@/features/place/place-picker';
import { getAllBookmarks } from '@/features/saved/api';

import { deleteMySave, getCoursePlaces, getSavedPlaces, patchMyMemo, putMySave } from '../api';
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

// N8 투표 열기 시트는 투표 쪽 테스트가 본다. 여기서는 무엇을 넘겨 여는지만 본다
jest.mock('@/features/poll/components/open-poll-sheet', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    OpenPollSheet: (props: {
      visible: boolean;
      initialType?: string;
      initialSelected?: string[];
      extraRegions?: { id: string; name: string }[];
      onOpened: (poll: { id: string }) => void;
    }) =>
      props.visible ? (
        <Pressable onPress={() => props.onOpened({ id: 'poll-9' })}>
          <Text>
            {`투표 열기 시트 ${props.initialType} ${(props.initialSelected ?? []).join(',')} ${(
              props.extraRegions ?? []
            )
              .map((r) => r.name)
              .join(',')}`.trim()}
          </Text>
        </Pressable>
      ) : null,
  };
});

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
    TextField: (props: Record<string, unknown>) => {
      const { TextInput } = jest.requireActual<typeof import('react-native')>('react-native');
      return <TextInput {...props} />;
    },
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
    toast: { show: jest.fn(), success: jest.fn(), error: jest.fn() },
  };
});

jest.setTimeout(20_000);

const mockList = jest.mocked(getSavedPlaces);
const mockPut = jest.mocked(putMySave);
const mockPatch = jest.mocked(patchMyMemo);
const mockDelete = jest.mocked(deleteMySave);
const mockCourse = jest.mocked(getCoursePlaces);
const mockBookmarks = jest.mocked(getAllBookmarks);
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
        <GroupFavoritesScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockReset();
  mockList.mockResolvedValue(page(sampleSaved()));
  mockCourse.mockResolvedValue({ placeIds: new Set(['p-haeundae']), updatedByMemberId: 'm-seeun' });
  mockPut.mockResolvedValue(saved(place('x', 'X'), ['m-me']));
  mockPatch.mockResolvedValue(saved(place('x', 'X'), ['m-me']));
  mockDelete.mockResolvedValue(undefined);
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
    expect(await screen.findByText('불러오지 못했어요', {}, { timeout: 4000 })).toBeTruthy();
  });
});

describe('담기와 빼기', () => {
  it('장소 검색으로 고른 장소를 담고 목록을 다시 받는다', async () => {
    mockPick.mockResolvedValue(place('p-new', '다대포 해수욕장'));
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('장소 추가'));
    expect(screen.getByText('겨울 여행 그룹 즐겨찾기')).toBeTruthy();
    await fireEvent.press(screen.getByText('장소 검색'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('trip-1', 'p-new'));
    expect(toast.success).toHaveBeenCalledWith('그룹 즐겨찾기에 담았어요');
    await waitFor(() => expect(mockList.mock.calls.length).toBeGreaterThan(1));
  });

  it('링크나 캡처로는 링크·캡처 등록 화면을 연다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('장소 추가'));
    await fireEvent.press(screen.getByText('링크나 캡처로'));
    expect(mockRouter.push).toHaveBeenCalledWith('/saved/add');
    expect(toast.show).not.toHaveBeenCalledWith('준비 중이에요');
  });

  it('개인 즐겨찾기에서 여러 곳을 골라 담고, 내가 이미 담은 곳은 담김이다', async () => {
    mockBookmarks.mockResolvedValue([
      bookmark(place('p-gamcheon', '감천문화마을')),
      bookmark(place('p-b1', '전포 카페거리')),
      bookmark(place('p-b2', '강문 해변')),
    ]);
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('장소 추가'));
    await fireEvent.press(screen.getByText('내 개인 즐겨찾기에서'));
    expect(await screen.findByText('담김')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('전포 카페거리'));
    await fireEvent.press(screen.getByLabelText('강문 해변'));
    await fireEvent.press(screen.getByText('2곳 담기'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(2));
    expect(mockPut.mock.calls.map(([, id]) => id)).toEqual(['p-b1', 'p-b2']);
    expect(toast.success).toHaveBeenCalledWith('2곳을 그룹 즐겨찾기에 담았어요');
  });

  it('동행만 담은 장소는 골라서 내 저장을 더할 수 있다', async () => {
    mockBookmarks.mockResolvedValue([bookmark(place('p-haeundae', '해운대 해변'))]);
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('장소 추가'));
    await fireEvent.press(screen.getByText('내 개인 즐겨찾기에서'));
    const row = await screen.findByRole('checkbox', { name: '해운대 해변' });
    expect(screen.queryByText('담김')).toBeNull();
    await fireEvent.press(row);
    await fireEvent.press(screen.getByText('1곳 담기'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('trip-1', 'p-haeundae'));
  });

  it('필터나 첫 쪽 때문에 목록에 없어도 내가 이미 담은 장소는 다시 보내지 않아 메모를 지킨다', async () => {
    // 화면 목록에는 서면이 없지만, 내가 담은 장소를 물으면 서면이 있다
    mockList.mockImplementation(async (_tripId, query) =>
      query.memberId
        ? page(sampleSaved())
        : page(sampleSaved().filter((i) => i.place.id !== 'p-seomyeon')),
    );
    mockBookmarks.mockResolvedValue([bookmark(place('p-seomyeon', '서면 돼지국밥집'))]);
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('장소 추가'));
    await fireEvent.press(screen.getByText('내 개인 즐겨찾기에서'));
    await fireEvent.press(await screen.findByRole('checkbox', { name: '서면 돼지국밥집' }));
    await fireEvent.press(screen.getByText('1곳 담기'));
    await waitFor(() =>
      expect(mockList).toHaveBeenCalledWith('trip-1', { filter: 'ALL', memberId: 'm-me' }, null),
    );
    await waitFor(() => expect(toast.show).toHaveBeenCalledWith('이미 담은 장소예요'));
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('안 담은 장소는 나도 담기를 두 번 눌러도 한 번 담는다', async () => {
    let resolve: () => void = () => {};
    mockPut.mockReturnValue(
      new Promise((r) => {
        resolve = () => r(saved(place('x', 'X'), ['m-me']));
      }),
    );
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('광안리 바다뷰 카페'));
    await fireEvent.press(screen.getByText('나도 담기'));
    await fireEvent.press(screen.getByText('나도 담기'));
    expect(mockPut).toHaveBeenCalledTimes(1);
    resolve();
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('내가 담은 장소는 메모를 고쳐 저장한다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('서면 돼지국밥집'));
    expect(screen.getByText('영광 · 나')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('내 메모'), '  저녁에 가요 ');
    await fireEvent.press(screen.getByText('메모 저장'));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('trip-1', 'p-seomyeon', '저녁에 가요'),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('메모를 저장했어요'));
  });

  it('코스에 없는 장소는 바로 내 저장을 뺀다', async () => {
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('서면 돼지국밥집'));
    await fireEvent.press(screen.getByLabelText('내 저장 빼기'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('trip-1', 'p-seomyeon'));
    expect(toast.show).toHaveBeenCalledWith('내 저장을 뺐어요');
  });

  it('필터를 바꿔 받다가 실패해도 필터 줄이 남아 전체로 돌아갈 수 있다', async () => {
    mockList.mockImplementation(async (_tripId, query) => {
      if (query.filter === 'OVERLAP') throw new Error('503');
      return page(sampleSaved());
    });
    await renderScreen();
    await screen.findByLabelText('해운대 해변');
    await fireEvent.press(screen.getByText(/^겹친 곳/));
    expect(await screen.findByText('불러오지 못했어요', {}, { timeout: 4000 })).toBeTruthy();
    await fireEvent.press(screen.getByText(/^전체/));
    expect(await screen.findByLabelText('해운대 해변')).toBeTruthy();
  });

  it('코스에 있는 장소를 빼면 확인을 띄우고 그래도 빼기로 뺀다', async () => {
    mockList.mockResolvedValue(
      page([saved(place('p-haeundae', '해운대 해변'), ['m-seeun', 'm-me'])]),
    );
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('해운대 해변'));
    await fireEvent.press(screen.getByLabelText('내 저장 빼기'));
    expect(await screen.findByText('코스에 들어 있는 장소예요')).toBeTruthy();
    expect(mockDelete).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('그래도 빼기'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('trip-1', 'p-haeundae'));
  });

  it('코스 확인에서 최신 목록 보기는 빼지 않고 다시 받는다', async () => {
    mockList.mockResolvedValue(
      page([saved(place('p-haeundae', '해운대 해변'), ['m-seeun', 'm-me'])]),
    );
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('해운대 해변'));
    await fireEvent.press(screen.getByLabelText('내 저장 빼기'));
    await fireEvent.press(await screen.findByText('최신 목록 보기'));
    expect(mockDelete).not.toHaveBeenCalled();
    await waitFor(() => expect(mockList.mock.calls.length).toBeGreaterThan(1));
  });
});

function bookmark(p: ReturnType<typeof place>) {
  return {
    place: p,
    retainedPlace: { name: p.name, latitude: p.latitude, longitude: p.longitude },
    memo: null,
    sourceFeedId: null,
    sourceUnavailable: false,
    createdAt: '2026-11-01T00:00:00Z',
  };
}

describe('장소 없음', () => {
  it('모은 장소가 없으면 안내와 장소 추가 버튼 하나만 보인다', async () => {
    mockList.mockResolvedValue(page([]));
    await renderScreen();
    expect(await screen.findByText('아직 모은 장소가 없어요')).toBeTruthy();
    // 거를 장소가 없어 거르기 줄과 목록·지도 바꾸기, 아래 버튼 줄을 숨긴다
    expect(screen.queryByText('전체 0')).toBeNull();
    expect(screen.queryByLabelText('동행별로 보기')).toBeNull();
    expect(screen.queryByLabelText('지도로 보기')).toBeNull();
    expect(screen.queryByText('투표 열기')).toBeNull();
    expect(screen.queryByText('추천 받기')).toBeNull();
    await fireEvent.press(screen.getByText('장소 추가'));
    expect(screen.getByText('장소 검색')).toBeTruthy();
  });

  it('겹친 곳만 비었으면 짧은 안내만 보인다', async () => {
    mockList.mockResolvedValueOnce(page(sampleSaved())).mockResolvedValueOnce(
      page([], {
        totals: { allPlaceCount: 5, overlapPlaceCount: 0, filteredCount: 0 },
      }),
    );
    await renderScreen();
    await fireEvent.press(await screen.findByText('겹친 곳 3'));
    expect(await screen.findByText('겹친 곳이 아직 없어요')).toBeTruthy();
    expect(screen.queryByText('아직 모은 장소가 없어요')).toBeNull();
  });
});

describe('후보 고르기와 추천', () => {
  it('투표 열기를 누르면 줄을 골라 개수가 버튼에 보이고 확정하면 그 장소로 투표 열기 시트를 연다', async () => {
    mockList.mockResolvedValue(page(sampleSaved()));
    await renderScreen();
    await fireEvent.press(await screen.findByText('투표 열기'));
    expect(screen.getByText('후보를 골라 주세요')).toBeTruthy();
    const rows = screen.getAllByRole('checkbox');
    await fireEvent.press(rows[0]);
    await fireEvent.press(rows[1]);
    expect(screen.getByText('2곳으로 투표 열기')).toBeTruthy();
    await fireEvent.press(rows[1]);
    expect(screen.getByText('1곳으로 투표 열기')).toBeTruthy();
    await fireEvent.press(screen.getByText('1곳으로 투표 열기'));
    expect(screen.getByText(/^투표 열기 시트 PLACE \S+$/)).toBeTruthy();
    expect(toast.show).not.toHaveBeenCalledWith('준비 중이에요');
    // 고르는 중에는 장소 시트가 열리지 않는다
    expect(screen.queryByLabelText('내 메모')).toBeNull();
    await fireEvent.press(screen.getByText('취소'));
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByText('투표 열기')).toBeTruthy();
  });

  it('투표가 열리면 고르기를 끝내고 그 투표 화면으로 간다', async () => {
    mockList.mockResolvedValue(page(sampleSaved()));
    await renderScreen();
    await fireEvent.press(await screen.findByText('투표 열기'));
    await fireEvent.press(screen.getAllByRole('checkbox')[0]);
    await fireEvent.press(screen.getByText('1곳으로 투표 열기'));
    await fireEvent.press(screen.getByText(/^투표 열기 시트/));
    expect(mockRouter.push).toHaveBeenCalledWith('/trips/trip-1/polls/poll-9');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('추천 받기는 추천 결과를 연다', async () => {
    mockList.mockResolvedValue(page(sampleSaved()));
    await renderScreen();
    await fireEvent.press(await screen.findByText('추천 받기'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/trips/[tripId]/recommend',
      params: { tripId: 'trip-1' },
    });
    expect(toast.show).not.toHaveBeenCalledWith('준비 중이에요');
  });
});

describe('지도 핀', () => {
  it('좌표가 없는 장소는 핀을 그리지 않는다', async () => {
    const items = sampleSaved();
    const broken = {
      ...items[1],
      place: { ...items[1].place, latitude: null as unknown as number },
    };
    mockList.mockResolvedValue(page([items[0], broken]));
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('지도로 보기'));
    expect(
      screen.getByLabelText(`${items[0].place.name}, ${items[0].savedCount}명이 담았어요`),
    ).toBeTruthy();
    expect(
      screen.queryByLabelText(`${broken.place.name}, ${broken.savedCount}명이 담았어요`),
    ).toBeNull();
  });
});

describe('지도에서 후보 고르기', () => {
  it('고르는 중에 지도로 바꿔도 장소 카드를 눌러 고른다', async () => {
    const items = sampleSaved();
    mockList.mockResolvedValue(page(items));
    await renderScreen();
    await fireEvent.press(await screen.findByText('투표 열기'));
    await fireEvent.press(screen.getByLabelText('지도로 보기'));
    await fireEvent.press(
      screen.getByLabelText(`${items[0].place.name}, ${items[0].savedCount}명이 담았어요`),
    );
    const card = screen.getByRole('checkbox');
    expect(card.props.accessibilityState).toEqual({ checked: false });
    await fireEvent.press(card);
    expect(screen.getByRole('checkbox').props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByText('1곳으로 투표 열기')).toBeTruthy();
    expect(screen.queryByLabelText('내 메모')).toBeNull();
  });
});
