import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { openOverTabs } from '@/lib/open-over-tabs';

import { acceptInvitation, getInvitationPreview } from '../api';

import { InviteScreen } from './invite-screen';

/**
 * 이미 동행인 여행의 초대 링크를 열면 잠깐 뒤 자동으로 참여 요청을 보내 그 여행으로 넘어간다.
 * 그 요청이 실패하면 "이동하는 중"에서 멈췄고 뒤로 갈 길도 없었다(2026-11-10 점검). 실패하면 다시 시도와 홈으로를 준다
 */

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ token: 'tok-1' }) }));
// 공통 부품 입구는 하단 시트 모듈까지 불러와 테스트에서 못 쓴다. 이 화면이 쓰는 부품만 실제 것이나 단순한 것으로 준다
jest.mock('@/components/ui', () => {
  const { Icon } =
    jest.requireActual<typeof import('@/components/ui/icon')>('@/components/ui/icon');
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const TextButton = ({ label, onPress }: { label: string; onPress?: () => void }) => (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Text>{label}</Text>
    </Pressable>
  );
  return {
    Icon,
    Button: TextButton,
    Header: () => <View />,
    ErrorState: ({ title }: { title: string }) => <Text>{title}</Text>,
    toast: { show: jest.fn(), error: jest.fn(), success: jest.fn() },
  };
});
jest.mock('@/lib/open-over-tabs', () => ({ openOverTabs: jest.fn() }));
jest.mock('@/stores/session-store', () => ({
  useSessionStore: (pick: (s: { setPendingInvite: () => void }) => unknown) =>
    pick({ setPendingInvite: () => undefined }),
}));
jest.mock('@/features/trip/hooks/trip-cache', () => ({ invalidateAfterJoin: jest.fn() }));
jest.mock('../api', () => ({ getInvitationPreview: jest.fn(), acceptInvitation: jest.fn() }));

const mockPreview = jest.mocked(getInvitationPreview);
const mockAccept = jest.mocked(acceptInvitation);
const mockOpen = jest.mocked(openOverTabs);

const preview = {
  tripId: 'trip-1',
  tripTitle: '겨울 여행',
  startDate: '2026-12-01',
  endDate: '2026-12-03',
  inviter: { nickname: '세은', profileImageUrl: null },
  alreadyMember: true,
} as unknown as Awaited<ReturnType<typeof getInvitationPreview>>;

const trip = { id: 'trip-1' } as Awaited<ReturnType<typeof acceptInvitation>>;

async function renderScreen() {
  const client = new QueryClient({
    // 정리 타이머가 남으면 테스트가 끝나도 jest가 기다린다. 다른 테스트와 같이 정리하지 않게 둔다
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 800 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>
        <InviteScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

const SOON = { timeout: 4000 };

beforeEach(() => {
  jest.clearAllMocks();
  mockPreview.mockResolvedValue(preview);
});

describe('이미 동행인 여행의 초대 링크', () => {
  it('자동 참여가 되면 그 여행으로 넘어간다', async () => {
    mockAccept.mockResolvedValue(trip);
    await renderScreen();
    expect(await screen.findByText('이동하는 중')).toBeTruthy();
    await screen.findByText('이동하는 중');
    await new Promise((r) => setTimeout(r, 1500));
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockOpen).toHaveBeenCalledWith({
      pathname: '/trips/[tripId]',
      params: { tripId: 'trip-1' },
    });
  });

  it('자동 참여가 실패하면 이동하는 중에 머물지 않고 다시 시도와 홈으로를 보인다', async () => {
    mockAccept.mockRejectedValue(new Error('network'));
    await renderScreen();
    expect(await screen.findByText('여행으로 이동하지 못했어요', {}, SOON)).toBeTruthy();
    expect(screen.queryByText('이동하는 중')).toBeNull();
    expect(screen.getByText('다시 시도')).toBeTruthy();
    expect(screen.getByText('홈으로')).toBeTruthy();
    // 자동 요청은 한 번만 나간다. 실패했다고 혼자 되풀이하지 않는다
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('다시 시도가 성공하면 그 여행으로 넘어간다', async () => {
    mockAccept.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(trip);
    await renderScreen();
    await fireEvent.press(await screen.findByText('다시 시도', {}, SOON));
    await screen.findByText('이동하는 중');
    await new Promise((r) => setTimeout(r, 50));
    expect(mockAccept).toHaveBeenCalledTimes(2);
    expect(mockOpen).toHaveBeenCalledWith({
      pathname: '/trips/[tripId]',
      params: { tripId: 'trip-1' },
    });
  });

  it('실패 안내의 홈으로는 홈으로 간다', async () => {
    mockAccept.mockRejectedValue(new Error('network'));
    await renderScreen();
    await fireEvent.press(await screen.findByText('홈으로', {}, SOON));
    expect(mockOpen).toHaveBeenCalledWith('/home');
  });
});
