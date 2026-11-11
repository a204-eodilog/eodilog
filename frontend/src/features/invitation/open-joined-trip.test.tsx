import { describe, expect, it, jest } from '@jest/globals';
import { Stack, Tabs, router } from 'expo-router';
import { act, renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { unstable_settings as mainSettings } from '@/app/(main)/_layout';
import { openOverTabs } from '@/lib/open-over-tabs';

import { openJoinedTrip } from './open-joined-trip';

/**
 * 초대를 수락하면 참여한 여행(S17)이 열리고, 그 밑에는 탭 화면이 하나만 있어야 한다(2026-11-09).
 * 앱을 링크로 막 켠 경우(아래에 아무 화면도 없음)와 앱을 쓰던 중 링크를 연 경우를 모두 본다.
 * 실제 화면 대신 앱과 같은 폴더 구조의 빈 화면을 쓰고, (main) 레이아웃 설정은 앱 파일에서 가져온다
 */

jest.mock('@/stores/session-store', () => ({ useSessionStore: () => 'signedIn' }));
// (main) 레이아웃이 알림 팝업 자리를 불러오고, 그 자리가 서버 연결 코드와 환경 변수까지 불러온다. 설정만 쓰므로 비운다
jest.mock('@/features/notification/screens/popup-host', () => ({
  NotificationPopupHost: () => null,
}));

const Screen = (name: string) =>
  function MockScreen() {
    return <Text>{name}</Text>;
  };

const routes = {
  _layout: () => <Stack />,
  'invitations/[token]': Screen('invite'),
  '(main)/_layout': { default: () => <Stack />, unstable_settings: mainSettings },
  '(main)/(tabs)/_layout': () => <Tabs />,
  '(main)/(tabs)/home': Screen('home'),
  '(main)/(tabs)/trips': Screen('trips'),
  '(main)/trips/[tripId]': Screen('detail'),
  '(main)/preferences': Screen('preferences'),
};

type State = { routes: { name: string; state?: State }[]; index: number };

/** 화면 쌓임을 글자로. 예: (main)[(tabs),trips/[tripId]] */
function shape(state: State | undefined): string {
  if (!state) return '';
  return state.routes.map((r) => r.name + (r.state ? `[${shape(r.state)}]` : '')).join(',');
}

async function start(from: 'link' | 'app') {
  const r = await renderRouter(routes, {
    initialUrl: from === 'link' ? '/invitations/abc' : '/home',
  });
  if (from === 'app') await act(async () => router.push('/invitations/abc'));
  return r;
}

describe('초대 수락 뒤 여행으로 가기', () => {
  it.each(['link', 'app'] as const)(
    '%s: 여행 상세가 열리고, 뒤로 가면 탭 화면이다',
    async (from) => {
      const r = await start(from);

      await act(async () => openJoinedTrip('trip-1'));

      expect(r.getPathname()).toBe('/trips/trip-1');
      // 루트에는 (main) 하나만 있고, 그 안에 탭 화면 위로 여행 상세가 쌓인다(초대 화면은 남지 않는다)
      expect(shape(r.getRouterState() as State)).toMatch(
        /^__root\[\(main\)\[\(tabs\)\[[^\]]*\],trips\/\[tripId\]\]\]$/,
      );

      await act(async () => router.back());
      expect(r.getSegments()).toContain('(tabs)');
    },
  );

  it('처음 가입해 취향 입력(S03)을 거친 뒤에도 같은 모양으로 그 여행이 열린다', async () => {
    const r = await start('link');
    // 초대 화면은 첫 가입이면 취향 입력을 같은 방식으로 연다
    await act(async () => openOverTabs({ pathname: '/preferences', params: { tripId: 'trip-1' } }));

    await act(async () => openJoinedTrip('trip-1'));

    expect(r.getPathname()).toBe('/trips/trip-1');
    expect(shape(r.getRouterState() as State)).toMatch(
      /^__root\[\(main\)\[\(tabs\)\[[^\]]*\],trips\/\[tripId\]\]\]$/,
    );
  });

  it.each(['link', 'app'] as const)(
    '%s: 취소·홈으로도 탭 묶음을 하나 더 만들지 않는다',
    async (from) => {
      const r = await start(from);

      await act(async () => openOverTabs('/home'));

      expect(r.getPathname()).toBe('/home');
      expect(shape(r.getRouterState() as State)).toMatch(
        /^__root\[\(main\)\[\(tabs\)\[[^\]]*\]\]\]$/,
      );
    },
  );
});
