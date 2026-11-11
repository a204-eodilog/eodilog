import { describe, expect, it, jest } from '@jest/globals';
import { Stack, Tabs, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { unstable_settings as mainSettings } from '@/app/(main)/_layout';

import { TripGoneState } from './trip-gone-state';

/**
 * "볼 수 없는 여행이에요"의 [여행 목록으로]는 이미 있는 탭 화면의 여행 탭으로 돌아간다(2026-11-09).
 * 예전에는 탭 묶음을 하나 더 만들어, 안드로이드 뒤로 버튼에 같은 탭 화면이 또 나왔다
 */

jest.mock('@/stores/session-store', () => ({ useSessionStore: () => 'signedIn' }));
// (main) 레이아웃이 알림 팝업 자리를 불러오고, 그 자리가 서버 연결 코드와 환경 변수까지 불러온다. 설정만 쓰므로 비운다
jest.mock('@/features/notification/screens/popup-host', () => ({
  NotificationPopupHost: () => null,
}));
// 바텀시트까지 불러오는 UI 묶음 대신, 버튼 글자와 누르기만 있는 빈 안내를 쓴다
jest.mock('@/components/ui', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    EmptyState: ({ actionLabel, onAction }: { actionLabel: string; onAction: () => void }) => (
      <MockText onPress={onAction}>{actionLabel}</MockText>
    ),
  };
});

const Screen = (name: string) =>
  function MockScreen() {
    return <Text>{name}</Text>;
  };

const routes = {
  _layout: () => <Stack />,
  '(main)/_layout': { default: () => <Stack />, unstable_settings: mainSettings },
  '(main)/(tabs)/_layout': () => <Tabs />,
  '(main)/(tabs)/home': Screen('home'),
  '(main)/(tabs)/trips': Screen('trips'),
  '(main)/trips/[tripId]': TripGoneState,
};

type State = { routes: { name: string; state?: State }[] };
/** 맨 바깥 __root를 벗긴 루트 스택 */
const rootStack = (state: State) => state.routes[0].state!;
const mainCount = (state: State) => state.routes.filter((r) => r.name === '(main)').length;
const mainRoutes = (state: State) =>
  state.routes.find((r) => r.name === '(main)')?.state?.routes.map((r) => r.name) ?? [];

describe('볼 수 없는 여행 → 여행 목록으로', () => {
  it('앱을 쓰던 중이면 탭 묶음을 하나 더 만들지 않고 여행 탭으로 돌아간다', async () => {
    const r = await renderRouter(routes, { initialUrl: '/home' });
    await act(async () => router.push('/trips/gone-1'));

    await act(async () => fireEvent.press(screen.getByText('여행 목록으로')));

    const state = rootStack(r.getRouterState() as State);
    expect(r.getPathname()).toBe('/trips');
    expect(mainCount(state)).toBe(1);
    expect(mainRoutes(state)).toEqual(['(tabs)']);
  });

  it('링크로 그 여행을 바로 열었어도 여행 탭으로 간다', async () => {
    const r = await renderRouter(routes, { initialUrl: '/trips/gone-1' });

    await act(async () => fireEvent.press(screen.getByText('여행 목록으로')));

    const state = rootStack(r.getRouterState() as State);
    expect(r.getPathname()).toBe('/trips');
    expect(mainCount(state)).toBe(1);
  });
});
