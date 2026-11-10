import { beforeEach, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { toast } from '@/components/ui';
import { TripMenuGrid } from '@/features/trip/components/trip-menu-grid';

const mockRouter = { push: jest.fn() };

jest.mock('expo-router', () => ({
  // jest.mock은 위로 끌어올려져 mockRouter가 만들어지기 전에 불릴 수 있어 꺼낼 때 읽는다
  get router() {
    return mockRouter;
  },
}));

jest.mock('@/components/ui', () => {
  const actual = jest.requireActual<typeof import('@/components/ui/icon')>('@/components/ui/icon');
  return { Icon: actual.Icon, toast: { show: jest.fn() } };
});

beforeEach(() => {
  jest.clearAllMocks();
});

it('여행 상세의 추천 메뉴는 추천 결과를 연다', async () => {
  await render(<TripMenuGrid tripId="trip-1" />);
  await fireEvent.press(screen.getByLabelText('추천'));
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/trips/[tripId]/recommend',
    params: { tripId: 'trip-1' },
  });
  expect(toast.show).not.toHaveBeenCalled();
});
