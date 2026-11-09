import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createPoll, getPoll, getPolls, getTripSavedPlaces } from '../api';
import { poll, savedPlace } from '../testing';
import { PollScreen } from './poll-screen';

const mockParams: { tripId: string; pollId?: string } = { tripId: 'trip-1' };
const mockRouter = { replace: jest.fn(), back: jest.fn(), push: jest.fn() };

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
      name: id === 'busan' ? '부산광역시' : '강원특별자치도 강릉시',
    })),
    ready: true,
  }),
}));

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

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PollScreen />
    </QueryClientProvider>,
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
