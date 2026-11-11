import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render } from '@testing-library/react-native';
import { router } from 'expo-router';

import { ChatRoomsScreen } from './chat-rooms-screen';

/**
 * 채팅 탭(S46)의 당겨서 새로고침 표시는 사람이 당겼을 때만 돈다(2026-11-09).
 * 앱 복귀로 실시간이 다시 연결되면 대화방 목록을 조용히 다시 받는데, 그때 표시가 저절로 돌면 안 된다
 */

type Row = { room: { tripId: string } };
type ViewProps = {
  refreshing: boolean;
  onRefresh: () => Promise<unknown> | void;
  onOpen: (row: Row) => void;
};
const mockView: { props: ViewProps | null } = { props: null };

jest.mock('../components/chat-room-list-view', () => ({
  BANNER_STYLE: {},
  ChatRoomListView: (props: ViewProps) => {
    mockView.props = props;
    return null;
  },
}));
jest.mock('../components/connection-banner', () => ({ ConnectionBanner: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: () => undefined }));
// 당겨서 새로고침은 연결 상태(onlineManager)를 본다. 그것은 진짜를 쓴다
jest.mock('@tanstack/react-query', () => ({
  onlineManager:
    jest.requireActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
      .onlineManager,
  useQueryClient: () => ({ setQueryData: jest.fn() }),
}));

const mockRooms = {
  refetch: jest.fn<() => Promise<unknown>>(),
  // 쿼리가 조용히 다시 받는 중(앱 복귀·다시 연결)
  isRefetching: true,
};
jest.mock('../hooks/use-chat-rooms', () => ({
  useChatRooms: () => ({ featured: null, rows: [], meId: 'me', status: 'ready', ...mockRooms }),
}));

beforeEach(() => {
  mockView.props = null;
  mockRooms.refetch.mockReset();
});

describe('채팅 탭 당겨서 새로고침 표시', () => {
  it('목록을 조용히 다시 받는 동안에는 표시가 돌지 않는다', async () => {
    await render(<ChatRoomsScreen />);
    expect(mockView.props?.refreshing).toBe(false);
  });

  it('사람이 당기면 다시 받는 동안만 돈다', async () => {
    let finish: () => void = () => undefined;
    mockRooms.refetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(undefined);
        }),
    );
    await render(<ChatRoomsScreen />);

    let pulling: Promise<unknown> | void = undefined;
    await act(async () => {
      pulling = mockView.props?.onRefresh();
    });
    expect(mockView.props?.refreshing).toBe(true);
    expect(mockRooms.refetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish();
      await pulling;
    });
    expect(mockView.props?.refreshing).toBe(false);
  });
});

/**
 * 대화방은 한 번만 열린다(2026-11-10 점검).
 * 방을 빠르게 두 번 누르면 같은 방이 두 겹으로 열려 뒤로 가기를 두 번 눌러야 했다
 */
describe('대화방 열기', () => {
  const row = (tripId: string): Row => ({ room: { tripId } });

  beforeEach(() => {
    jest.mocked(router.push).mockClear();
  });

  it('같은 방을 연달아 두 번 눌러도 한 번만 연다', async () => {
    await render(<ChatRoomsScreen />);
    await act(async () => {
      mockView.props?.onOpen(row('trip-1'));
      mockView.props?.onOpen(row('trip-1'));
    });
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/trips/[tripId]/chat',
      params: { tripId: 'trip-1' },
    });
  });

  it('여는 동안 다른 방을 눌러도 처음 누른 방만 연다', async () => {
    await render(<ChatRoomsScreen />);
    await act(async () => {
      mockView.props?.onOpen(row('trip-1'));
      mockView.props?.onOpen(row('trip-2'));
    });
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/trips/[tripId]/chat',
      params: { tripId: 'trip-1' },
    });
  });
});
