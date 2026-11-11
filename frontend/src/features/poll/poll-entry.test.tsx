import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { SYSTEM_CARD_ROUTES } from '@/features/chat/system-card-routes';
import { TripMenuGrid } from '@/features/trip/components/trip-menu-grid';

import { pollRoutes } from './poll-routes';

/** 다른 화면에서 투표 화면으로 들어오는 길(투표 명세 User Story 5) */

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    get push() {
      return mockPush;
    },
  },
}));
const mockToast = { show: jest.fn() };
jest.mock('@/components/ui', () => ({
  ...jest.requireActual<typeof import('@/components/ui/icon')>('@/components/ui/icon'),
  get toast() {
    return mockToast;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('투표 화면으로 들어오는 길', () => {
  it('여행 상세의 투표 메뉴는 그 여행의 투표 화면으로 간다', async () => {
    await render(<TripMenuGrid tripId="trip-1" />);
    await fireEvent.press(screen.getByLabelText('투표'));
    expect(mockPush).toHaveBeenCalledWith('/trips/trip-1/polls');
    expect(mockToast.show).not.toHaveBeenCalled();
  });

  it('채팅 투표 카드는 대상 투표로, 대상이 투표가 아니면 대표 투표로 간다', () => {
    const open = SYSTEM_CARD_ROUTES.poll;
    expect(open).toBeDefined();
    open?.({ type: 'POLL', id: 'poll-9' }, 'trip-1');
    expect(mockPush).toHaveBeenLastCalledWith('/trips/trip-1/polls/poll-9');
    open?.({ type: 'TRIP', id: 'trip-1' }, 'trip-1');
    expect(mockPush).toHaveBeenLastCalledWith('/trips/trip-1/polls');
  });

  it('채팅 코스 카드는 그 여행의 코스 화면으로 간다', () => {
    SYSTEM_CARD_ROUTES.course?.({ type: 'ITINERARY', id: 'trip-1' }, 'trip-1');
    expect(mockPush).toHaveBeenLastCalledWith('/trips/trip-1/course');
  });
});

describe('투표 결과에서 나가는 길', () => {
  it('동률은 코스 짜기의 날짜별로 나누기로, 여행지 확정은 그룹 즐겨찾기로 간다', () => {
    pollRoutes.splitByDay('trip-1');
    expect(mockPush).toHaveBeenLastCalledWith('/trips/trip-1/course/edit?split=1');
    pollRoutes.collectPlaces('trip-1');
    expect(mockPush).toHaveBeenLastCalledWith('/trips/trip-1/favorites');
    expect(mockToast.show).not.toHaveBeenCalled();
  });
});
