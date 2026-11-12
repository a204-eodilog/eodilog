import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { getRegion, getTrip, updateTrip } from '../api';
import { useTripEditDraft } from '../hooks/use-trip-edit-draft';
import type { Region, Trip } from '../types';

import { TripRegionScreen } from './trip-region-screen';

const mockRouter = { back: jest.fn() };
jest.mock('expo-router', () => ({
  router: { back: () => mockRouter.back() },
  useLocalSearchParams: () => ({ tripId: 't1' }),
  useNavigation: () => ({ isFocused: () => true }),
}));
jest.mock('../api', () => ({ updateTrip: jest.fn(), getTrip: jest.fn(), getRegion: jest.fn() }));
jest.mock('../invite-storage', () => ({ forgetInviteLink: jest.fn() }));
jest.mock('@/components/ui', () => ({
  toast: { show: jest.fn() },
  Header: () => null,
  ErrorState: () => null,
}));
jest.mock('@/components/ui/spinner', () => ({ Spinner: () => null }));
jest.mock('../components/trip-gone-state', () => ({ TripGoneState: () => null }));

const mockBusan: Region = {
  id: 'r-busan',
  code: '26',
  name: '부산광역시',
  parentId: null,
  latitude: null,
  longitude: null,
};

// 검색 화면 자리. 지역 하나를 고르는 버튼과 아래 [고르기] 버튼만 둔다
jest.mock('./region-search-screen', () => ({
  RegionSearchScreen: ({ onDone }: { onDone?: () => void }) => {
    const { useTripEditDraft: draft } = jest.requireActual<
      typeof import('../hooks/use-trip-edit-draft')
    >('../hooks/use-trip-edit-draft');
    const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <>
        <Pressable onPress={() => draft.getState().addRegion(mockBusan)}>
          <Text>부산 고르기</Text>
        </Pressable>
        <Pressable onPress={onDone}>
          <Text>완료</Text>
        </Pressable>
      </>
    );
  },
}));

const mockGetTrip = jest.mocked(getTrip);
const mockUpdateTrip = jest.mocked(updateTrip);

function makeTrip(over: Partial<Trip>): Trip {
  return {
    id: 't1',
    title: '겨울 여행',
    startDate: null,
    endDate: null,
    destinationRegionIds: [],
    status: 'PLANNING',
    currency: 'KRW',
    ownerMemberId: 'm1',
    members: [],
    version: 3,
    expenseVersion: 0,
    ...over,
  };
}

async function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await render(
    <QueryClientProvider client={queryClient}>
      <TripRegionScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockGetTrip.mockReset();
  mockUpdateTrip.mockReset();
  mockRouter.back.mockReset();
  // 저장 뒤 여행 상세가 여행지 이름을 받을 때 쓴다
  jest.mocked(getRegion).mockResolvedValue(mockBusan);
  useTripEditDraft.getState().reset();
});

describe('TripRegionScreen', () => {
  it('여행지를 고르고 누르면 바로 저장하고 뒤로 간다', async () => {
    mockGetTrip.mockResolvedValue(makeTrip({}));
    mockUpdateTrip.mockResolvedValue(makeTrip({ destinationRegionIds: ['r-busan'], version: 4 }));
    await renderScreen();

    await fireEvent.press(await screen.findByText('부산 고르기'));
    await fireEvent.press(screen.getByText('완료'));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(mockUpdateTrip).toHaveBeenCalledWith('t1', {
      expectedVersion: 3,
      destinationRegionIds: ['r-busan'],
    });
  });

  it('아무것도 고르지 않고 누르면 저장 없이 뒤로 간다', async () => {
    mockGetTrip.mockResolvedValue(makeTrip({}));
    await renderScreen();

    await fireEvent.press(await screen.findByText('완료'));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(mockUpdateTrip).not.toHaveBeenCalled();
  });

  it('저장에 실패하면 화면에 남는다', async () => {
    mockGetTrip.mockResolvedValue(makeTrip({}));
    mockUpdateTrip.mockRejectedValue(new Error('fail'));
    await renderScreen();

    await fireEvent.press(await screen.findByText('부산 고르기'));
    await fireEvent.press(screen.getByText('완료'));

    await waitFor(() => expect(mockUpdateTrip).toHaveBeenCalledTimes(1));
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});
