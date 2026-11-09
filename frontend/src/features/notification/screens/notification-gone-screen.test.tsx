import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { toast } from '@/components/ui';

import { dismissNotification } from '../api';

import { NotificationGoneScreen } from './notification-gone-screen';

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
const mockRouter = { back: jest.fn(), dismissTo: jest.fn() };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'n-9' }),
  get router() {
    return mockRouter;
  },
}));
jest.mock('../api', () => ({ dismissNotification: jest.fn() }));
jest.mock('@/features/my-trips/api', () => ({ getAllMyTrips: jest.fn() }));
jest.mock('@/components/ui', () => {
  const actual = jest.requireActual<typeof import('@/components/ui/icon')>('@/components/ui/icon');
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Icon: actual.Icon,
    Header: ({ title }: { title?: string }) => <Text>{title}</Text>,
    Button: ({ label, onPress }: { label: string; onPress?: () => void }) => (
      <Pressable onPress={onPress} accessibilityRole="button">
        <Text>{label}</Text>
      </Pressable>
    ),
    toast: { show: jest.fn(), success: jest.fn(), error: jest.fn() },
  };
});

const mockDismiss = jest.mocked(dismissNotification);

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
        <NotificationGoneScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDismiss.mockResolvedValue(undefined);
});

describe('S49 볼 수 없음', () => {
  it('안내와 알림 목록으로. 팝업에서 왔어도 목록으로 간다', async () => {
    await renderScreen();
    expect(screen.getByText('볼 수 없는 알림이에요')).toBeTruthy();
    expect(screen.getByText('나간 여행이거나 지워진 기록이라 열 수 없어요')).toBeTruthy();
    await fireEvent.press(screen.getByText('알림 목록으로'));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/notifications');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('이 알림 지우기는 지우고 목록으로 돌아간다', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText('이 알림 지우기'));
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/notifications'));
    expect(mockDismiss).toHaveBeenCalledWith('n-9');
    expect(toast.show).toHaveBeenCalledWith('알림을 지웠어요');
  });

  it('지우지 못하면 알리고 그대로 있는다', async () => {
    mockDismiss.mockRejectedValue(new Error('500'));
    await renderScreen();
    await fireEvent.press(screen.getByText('이 알림 지우기'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('알림을 지우지 못했어요. 다시 시도해 주세요'),
    );
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });
});
