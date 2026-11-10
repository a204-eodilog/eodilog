import { beforeEach, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { toast } from '@/components/ui';

import { TripMenuGrid } from './trip-menu-grid';

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

it('여행 중 메뉴는 준비물 화면을 연다', async () => {
  await render(<TripMenuGrid tripId="trip-1" />);
  await fireEvent.press(screen.getByLabelText('여행 중'));
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/trips/[tripId]/checklist',
    params: { tripId: 'trip-1' },
  });
  expect(toast.show).not.toHaveBeenCalled();
});

it('화면이 아직 없는 메뉴는 준비 중 안내를 띄운다', async () => {
  await render(<TripMenuGrid tripId="trip-1" />);
  await fireEvent.press(screen.getByLabelText('게시'));
  expect(toast.show).toHaveBeenCalledWith('준비 중이에요');
  expect(mockRouter.push).not.toHaveBeenCalled();
});
