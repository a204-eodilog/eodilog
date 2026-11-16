import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  addCandidate,
  closePoll,
  createPoll,
  getPoll,
  getPolls,
  getTripSavedPlaces,
  replaceBallot,
} from '../api';
import { candidate, poll, savedPlace } from '../testing';
import { PollScreen } from './poll-screen';

const mockRegionNames: Record<string, string> = {
  busan: '부산광역시',
  gangneung: '강원특별자치도 강릉시',
  yeosu: '전라남도 여수시',
};
const mockParams: { tripId: string; pollId?: string } = { tripId: 'trip-1' };
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
  getPolls: jest.fn(),
  getPoll: jest.fn(),
  createPoll: jest.fn(),
  replaceBallot: jest.fn(),
  addCandidate: jest.fn(),
  closePoll: jest.fn(),
  getPlace: jest.fn(),
  getTripSavedPlaces: jest.fn(),
}));

jest.mock('@/features/trip/hooks/use-trip', () => ({
  tripKey: (id: string) => ['trips', id],
  useTrip: () => ({
    data: { id: 'trip-1', title: '겨울 여행', members: [] },
    notFound: false,
  }),
}));

jest.mock('@/features/trip/hooks/use-region-names', () => ({
  useRegions: (ids: string[]) => ({
    regions: ids.map((id) => ({
      id,
      name: mockRegionNames[id] ?? id,
    })),
    ready: true,
  }),
}));

// 확인 시트도 하단 시트라 내용만 그린다: 제목, 설명, 오류, 확인 버튼
jest.mock('@/components/ui/confirm-sheet', () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ConfirmSheet: (props: {
      visible: boolean;
      title: string;
      description?: string;
      confirmLabel: string;
      error?: string;
      loading?: boolean;
      onConfirm: () => void;
    }) =>
      props.visible ? (
        <View>
          <Text>{props.title}</Text>
          <Text>{props.description}</Text>
          {props.error ? <Text>{props.error}</Text> : null}
          <Pressable accessibilityRole="button" disabled={props.loading} onPress={props.onConfirm}>
            <Text>{props.confirmLabel}</Text>
          </Pressable>
        </View>
      ) : null,
  };
});

jest.mock('@/hooks/use-me', () => ({ useMe: () => ({ data: { nickname: '영광' } }) }));

jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: jest.fn() },
}));

// 하단 시트는 네이티브 애니메이션이 필요해 테스트에서는 내용만 그대로 그린다
jest.mock('@/components/ui', () => {
  const actual = jest.requireActual<typeof import('@/components/ui/icon')>('@/components/ui/icon');
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const Button = ({
    label,
    onPress,
    disabled,
  }: {
    label: string;
    onPress?: () => void;
    disabled?: boolean;
  }) => (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}>
      <Text>{label}</Text>
    </Pressable>
  );
  return {
    Icon: actual.Icon,
    Button,
    Chip: ({ label, onPress }: { label: string; onPress?: () => void }) => (
      <Pressable onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
    Tag: ({ label }: { label: string }) => <Text>{label}</Text>,
    Header: ({ title }: { title?: string }) => <Text>{title}</Text>,
    Avatar: () => null,
    AvatarGroup: () => null,
    ErrorState: ({ title }: { title?: string }) => <Text>{title ?? '불러오지 못했어요'}</Text>,
    EmptyState: ({
      title,
      actionLabel,
      onAction,
    }: {
      title: string;
      actionLabel?: string;
      onAction?: () => void;
    }) => (
      <View>
        <Text>{title}</Text>
        <Button label={actionLabel ?? ''} onPress={onAction} />
      </View>
    ),
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

// 첫 렌더가 느린 환경(아이콘 SVG)에서도 기다리도록 넉넉히 둔다
jest.setTimeout(20_000);

const mockGetPolls = jest.mocked(getPolls);
const mockGetPoll = jest.mocked(getPoll);
const mockCreatePoll = jest.mocked(createPoll);
const mockSaved = jest.mocked(getTripSavedPlaces);
const mockReplace = jest.mocked(replaceBallot);
const mockAddCandidate = jest.mocked(addCandidate);
const mockClosePoll = jest.mocked(closePoll);

let lastClient: QueryClient;
function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  lastClient = client;
  // 여행 상세 캐시가 있는 것처럼 둔다(지역 확정 뒤 무효화 확인)
  client.setQueryData(['trips', 'trip-1'], { id: 'trip-1', title: '겨울 여행' });
  // 아래에 뜨는 안내가 안전 영역을 읽는다. 테스트에서는 크기를 정해 준다
  const metrics = {
    frame: { x: 0, y: 0, width: 375, height: 812 },
    insets: { top: 47, left: 0, right: 0, bottom: 34 },
  };
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>
        <PollScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.pollId = undefined;
  mockSaved.mockResolvedValue([
    savedPlace('p1', 'busan', { name: '해운대 해변' }),
    savedPlace('p2', 'gangneung', { name: '강문 해변' }),
  ]);
});

describe('투표 열기', () => {
  it('투표가 없으면 빈 상태, 후보를 골라 투표를 열면 그 투표 주소로 바뀐다', async () => {
    mockGetPolls.mockResolvedValue([]);
    const opened = poll({ id: 'poll-new' });
    mockCreatePoll.mockResolvedValue(opened);
    await renderScreen();

    expect(await screen.findByText('진행 중인 투표가 없어요')).toBeTruthy();
    await fireEvent.press(screen.getByText('후보 고르러 가기'));
    expect(await screen.findByText('지역 투표 열기')).toBeTruthy();

    await fireEvent.press(await screen.findByLabelText('부산'));
    await fireEvent.press(screen.getByLabelText('강릉시'));
    expect(screen.getByText('후보 2곳 · 여러 곳을 고를 수 있어요')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('투표 열기'));
      fireEvent.press(screen.getByText('투표 열기'));
    });
    expect(mockCreatePoll).toHaveBeenCalledTimes(1);
    const [, body] = mockCreatePoll.mock.calls[0];
    expect(body.type).toBe('REGION');
    expect(body.title).toBe('어디로 갈까요?');
    expect(body.candidates).toEqual([{ regionId: 'busan' }, { regionId: 'gangneung' }]);
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/trips/[tripId]/polls/[pollId]',
      params: { tripId: 'trip-1', pollId: 'poll-new' },
    });
  });

  it('후보를 하나도 고르지 않으면 투표 열기를 누를 수 없다', async () => {
    mockGetPolls.mockResolvedValue([]);
    await renderScreen();
    await fireEvent.press(await screen.findByText('후보 고르러 가기'));
    await screen.findByLabelText('부산');
    await fireEvent.press(screen.getByText('투표 열기'));
    expect(mockCreatePoll).not.toHaveBeenCalled();
  });

  it('장소 칩을 누르면 장소 후보로 바뀐다', async () => {
    mockGetPolls.mockResolvedValue([]);
    await renderScreen();
    await fireEvent.press(await screen.findByText('후보 고르러 가기'));
    await fireEvent.press(screen.getByText('장소'));
    expect(await screen.findByText('장소 투표 열기')).toBeTruthy();
    expect(screen.getByLabelText('해운대 해변')).toBeTruthy();
  });

  it('주소의 투표가 없으면 볼 수 없는 투표 안내', async () => {
    mockParams.pollId = 'poll-gone';
    const notFound = Object.assign(new Error('404'), {
      isAxiosError: true,
      response: { status: 404, data: { error: { code: 'POLL_NOT_FOUND', message: '' } } },
    });
    mockGetPoll.mockRejectedValue(notFound);
    await renderScreen();
    expect(await screen.findByText('볼 수 없는 투표예요')).toBeTruthy();
  });
});

const OPEN = poll({
  candidates: [
    candidate('c1', { regionId: 'busan', voteCount: 1 }),
    candidate('c2', { regionId: 'gangneung', voteCount: 1 }),
  ],
  myCandidateIds: ['c1'],
  votedMemberCount: 2,
});

function versionConflict() {
  return Object.assign(new Error('409'), {
    isAxiosError: true,
    response: { status: 409, data: { error: { code: 'VERSION_CONFLICT', message: '' } } },
  });
}

describe('메뉴로 들어온 투표', () => {
  it('앱으로 돌아와 목록을 다시 받을 때 동행이 새 투표를 열었어도 보던 투표를 그대로 보인다', async () => {
    const first = { ...OPEN, id: 'poll-1', title: '지역 투표' };
    const newer = { ...OPEN, id: 'poll-2', title: '장소 투표' };
    mockGetPolls.mockResolvedValueOnce([first]).mockResolvedValue([newer, first]);
    mockGetPoll.mockImplementation(async (_tripId, id) => (id === 'poll-2' ? newer : first));
    await renderScreen();
    expect((await screen.findAllByText('지역 투표')).length).toBeGreaterThan(0);
    await act(async () => {
      await lastClient.refetchQueries({ queryKey: ['trips', 'trip-1', 'polls'] });
    });
    await waitFor(() => expect(mockGetPolls).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText('지역 투표').length).toBeGreaterThan(0);
    expect(screen.queryByText('장소 투표')).toBeNull();
    expect(mockGetPoll).not.toHaveBeenCalledWith('trip-1', 'poll-2', expect.anything());
  });
});

describe('진행 중 투표', () => {
  beforeEach(() => {
    mockParams.pollId = 'poll-1';
    mockGetPoll.mockResolvedValue(OPEN);
  });

  it('후보를 누르면 표 수와 내 선택이 바로 바뀌고 요약이 바뀐다', async () => {
    mockReplace.mockImplementation(() => new Promise(() => undefined));
    await renderScreen();
    expect(await screen.findByText('부산에 투표했어요')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('강릉시 1표'));
    expect(await screen.findByLabelText('강릉시 2표')).toBeTruthy();
    expect(screen.getByText('2곳 투표했어요')).toBeTruthy();
    expect(mockReplace).toHaveBeenCalledWith('trip-1', 'poll-1', ['c1', 'c2'], 1);
  });

  it('후보가 추가돼 저장이 거절되면 부산 선택을 그대로 두고 안내와 다시 시도를 보인다', async () => {
    mockReplace.mockRejectedValueOnce(versionConflict());
    await renderScreen();
    await screen.findByText('부산에 투표했어요');
    mockGetPoll.mockResolvedValue({ ...OPEN, version: 2 });
    await fireEvent.press(screen.getByLabelText('강릉시 1표'));
    // 안내 글은 보이지 않고 아이콘의 설명으로만 남는다
    expect(
      await screen.findByLabelText('강릉시로 바꾸지 못했어요. 부산 투표는 그대로예요'),
    ).toBeTruthy();
    expect(screen.queryByText('부산 투표는 그대로예요')).toBeNull();
    expect(screen.getByText('후보를 눌러 투표해요')).toBeTruthy();
    expect(screen.getByText('부산에 투표했어요')).toBeTruthy();

    mockReplace.mockResolvedValueOnce({ ...OPEN, version: 2, myCandidateIds: ['c1', 'c2'] });
    await fireEvent.press(screen.getByLabelText('다시 시도'));
    expect(mockReplace).toHaveBeenLastCalledWith('trip-1', 'poll-1', ['c1', 'c2'], 2);
  });

  it('취소를 누르면 내 선택을 모두 비운다', async () => {
    mockReplace.mockResolvedValue({ ...OPEN, myCandidateIds: [], votedMemberCount: 1 });
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('내 투표 취소'));
    expect(mockReplace).toHaveBeenCalledWith('trip-1', 'poll-1', [], 1);
    expect(await screen.findByText('후보를 눌러 투표해요')).toBeTruthy();
  });
});

describe('직접 종료', () => {
  // 지역 투표가 확정되면 여행 캐시를 투표마다 한 번만 새로 한다. 아래 '마감 결과' 테스트의 poll-1과 겹치지 않게 다른 투표로 둔다
  const MINE = { ...OPEN, id: 'poll-mine', canClose: true, eligibleMemberCount: 3 };
  const CLOSED_BY_ME = {
    ...MINE,
    status: 'FINALIZED' as const,
    closedReason: 'DEADLINE' as const,
    version: 2,
    canClose: false,
    closesAt: '2099-01-01T00:00:00Z',
    closedAt: '2026-10-27T09:40:00Z',
    closedByMemberId: 'member-me',
    candidates: [
      candidate('c1', { regionId: 'busan', voteCount: 2 }),
      candidate('c2', { regionId: 'gangneung', voteCount: 1 }),
    ],
    selectedCandidateIds: ['c1'],
  };

  beforeEach(() => {
    mockParams.pollId = 'poll-mine';
  });

  it('내가 끝낼 수 없는 투표에는 투표 종료 버튼이 없다', async () => {
    mockGetPoll.mockResolvedValue(OPEN);
    await renderScreen();
    expect(await screen.findByText('부산에 투표했어요')).toBeTruthy();
    expect(screen.queryByText('투표 종료')).toBeNull();
  });

  it('투표 종료를 누르면 확인을 받고, 마감하면 실제 마감 시각으로 결과 화면이 된다', async () => {
    mockGetPoll.mockResolvedValue(MINE);
    mockClosePoll.mockResolvedValue(CLOSED_BY_ME);
    await renderScreen();
    await fireEvent.press(await screen.findByText('투표 종료'));
    expect(screen.getByText('투표를 지금 마감할까요?')).toBeTruthy();
    // 3명 중 2명이 투표했다
    expect(
      screen.getByText(
        '1명이 아직 투표하지 않았어요. 지금 마감하면 가장 많이 받은 곳으로 확정돼요. 되돌릴 수 없어요',
      ),
    ).toBeTruthy();
    expect(mockClosePoll).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('마감하기'));
    expect(mockClosePoll).toHaveBeenCalledWith('trip-1', 'poll-mine', 1);
    expect(await screen.findByText('투표가 마감됐어요')).toBeTruthy();
    // 예정 시각(2099년)이 아니라 실제로 끝낸 시각
    expect(screen.getByText('10.27(화) 18:40 마감')).toBeTruthy();

    await fireEvent.press(screen.getByText('확정된 여행지 보기'));
    expect(await screen.findByText('10.27(화) 투표를 연 사람이 마감해 확정됐어요')).toBeTruthy();
  });

  it('그사이 후보가 추가돼 거절되면 다시 받아 새 후보를 보이고 마감하지 않는다', async () => {
    const withNew = {
      ...MINE,
      version: 2,
      candidates: [...MINE.candidates, candidate('c3', { regionId: 'yeosu' })],
    };
    mockGetPoll.mockResolvedValueOnce(MINE).mockResolvedValue(withNew);
    mockClosePoll.mockRejectedValueOnce(versionConflict());
    await renderScreen();
    await fireEvent.press(await screen.findByText('투표 종료'));
    await fireEvent.press(screen.getByText('마감하기'));
    expect(await screen.findByLabelText('여수시 0표')).toBeTruthy();
    // 확인 창이 닫히고 진행 중 화면에 남는다
    await waitFor(() => expect(screen.queryByText('투표를 지금 마감할까요?')).toBeNull());
    expect(screen.getByText('투표 종료')).toBeTruthy();
  });

  it('통신이 실패하면 확인 창에 남아 다시 누를 수 있다', async () => {
    mockGetPoll.mockResolvedValue(MINE);
    mockClosePoll.mockRejectedValueOnce(new Error('network')).mockResolvedValue(CLOSED_BY_ME);
    await renderScreen();
    await fireEvent.press(await screen.findByText('투표 종료'));
    await fireEvent.press(screen.getByText('마감하기'));
    expect(await screen.findByText('마감하지 못했어요')).toBeTruthy();
    await fireEvent.press(screen.getByText('마감하기'));
    expect(await screen.findByText('투표가 마감됐어요')).toBeTruthy();
    expect(mockClosePoll).toHaveBeenCalledTimes(2);
  });
});

describe('후보 추가', () => {
  it('+ 후보 추가로 아직 후보가 아닌 지역을 넣으면 새 후보 표시가 붙는다', async () => {
    mockParams.pollId = 'poll-1';
    mockGetPoll.mockResolvedValue(OPEN);
    mockSaved.mockResolvedValue([
      savedPlace('p1', 'busan'),
      savedPlace('p2', 'gangneung'),
      savedPlace('p3', 'yeosu'),
    ]);
    mockAddCandidate.mockResolvedValue({
      ...OPEN,
      version: 2,
      candidates: [
        ...OPEN.candidates,
        candidate('c3', { regionId: 'yeosu', addedAt: '2026-10-26T13:00:00Z' }),
      ],
    });
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText('후보 추가'));
    expect(await screen.findByText('후보에 넣기')).toBeTruthy();
    expect(screen.queryByLabelText('부산')).toBeNull();
    await fireEvent.press(await screen.findByLabelText('여수시'));
    await fireEvent.press(screen.getByText('후보에 넣기'));
    expect(mockAddCandidate).toHaveBeenCalledWith('trip-1', 'poll-1', { regionId: 'yeosu' }, 1);
    expect(await screen.findByText('새 후보')).toBeTruthy();
    expect(screen.getByText('투표 중에 추가됐어요')).toBeTruthy();
  });
});

describe('마감 결과', () => {
  const closed = {
    status: 'FINALIZED' as const,
    closedReason: 'DEADLINE' as const,
    closesAt: '2026-10-27T09:40:00Z',
  };

  beforeEach(() => {
    mockParams.pollId = 'poll-1';
  });

  it('최다 하나면 마감 카드와 결과, 확정된 여행지 보기를 누르면 여행지 확정 카드로 바뀌고 여행 캐시를 새로 한다', async () => {
    mockGetPoll.mockResolvedValue({
      ...OPEN,
      ...closed,
      votedMemberCount: 3,
      eligibleMemberCount: 3,
      candidates: [
        candidate('c1', { regionId: 'busan', voteCount: 2 }),
        candidate('c2', { regionId: 'gangneung', voteCount: 1 }),
      ],
      selectedCandidateIds: ['c1'],
    });
    await renderScreen();
    expect(await screen.findByText('투표가 마감됐어요')).toBeTruthy();
    expect(screen.getByText('가장 많이 받은 부산으로 확정됐어요')).toBeTruthy();
    expect(screen.getByText('10.27(화) 18:40 마감')).toBeTruthy();
    expect(screen.getByText('가장 많이')).toBeTruthy();
    expect(lastClient.getQueryState(['trips', 'trip-1'])?.isInvalidated).toBe(true);

    await fireEvent.press(screen.getByText('확정된 여행지 보기'));
    expect(await screen.findByText('겨울 여행 여행지')).toBeTruthy();
    expect(screen.getByText('3명 중 2표')).toBeTruthy();
    expect(screen.getByText('모두 투표했어요')).toBeTruthy();
    expect(screen.getByText('장소 모으고 코스 짜기')).toBeTruthy();
  });

  it('동률이면 같은 표 문구와 모두 확정 줄, 코스에서 날짜별로 나누기를 보인다', async () => {
    mockGetPoll.mockResolvedValue({ ...OPEN, ...closed, selectedCandidateIds: ['c1', 'c2'] });
    await renderScreen();
    expect(await screen.findByText('부산과 강릉시가 1표씩 같아요')).toBeTruthy();
    expect(screen.getByText('1명이 투표하지 않고 마감됐어요')).toBeTruthy();
    expect(screen.getByText('부산과 강릉시를 모두 확정했어요')).toBeTruthy();
    expect(screen.getByText('부산과 강릉시가 함께 확정됐어요')).toBeTruthy();
    expect(screen.getByText('코스에서 날짜별로 나누기')).toBeTruthy();
  });

  it('0표면 다시 열기가 같은 후보와 제목으로 24시간 뒤 마감 투표를 연다', async () => {
    mockGetPoll.mockResolvedValue({
      ...OPEN,
      status: 'CLOSED',
      closedReason: 'NO_VOTES',
      myCandidateIds: [],
      selectedCandidateIds: [],
    });
    mockCreatePoll.mockResolvedValue(poll({ id: 'poll-again' }));
    await renderScreen();
    expect(await screen.findByText('아무도 투표하지 않았어요')).toBeTruthy();
    const before = Date.now();
    await act(async () => {
      fireEvent.press(screen.getByText('다시 열기'));
    });
    expect(mockCreatePoll).toHaveBeenCalledTimes(1);
    const [, body] = mockCreatePoll.mock.calls[0];
    expect(body).toMatchObject({
      type: 'REGION',
      title: '어디로 갈까요?',
      candidates: [{ regionId: 'busan' }, { regionId: 'gangneung' }],
    });
    const hours = (Date.parse(body.closesAt) - before) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/trips/[tripId]/polls/[pollId]',
      params: { tripId: 'trip-1', pollId: 'poll-again' },
    });
  });
});
