import { Tabs } from 'expo-router';

import { TabBar, type TabKey } from '@/components/ui';

/** 탭 키 ↔ 이 폴더의 화면 파일 이름 */
const ROUTE_BY_TAB: Record<TabKey, string> = {
  home: 'home',
  trip: 'trips',
  bookmark: 'saved',
  chat: 'chats',
  me: 'me',
};

const TAB_BY_ROUTE = Object.fromEntries(
  Object.entries(ROUTE_BY_TAB).map(([tab, route]) => [route, tab as TabKey]),
) as Record<string, TabKey>;

/** 탭이 겹쳐 바뀌는 시간(ms) */
const TAB_FADE_MS = 120;

/** 하단 탭 5개. 탭 첫 화면만 여기 두고, 상세·입력 화면은 (main) Stack에 둬서 탭이 보이지 않게 한다 */
export default function TabsLayout() {
  return (
    <Tabs
      // 탭 화면은 처음 누를 때 만든다(lazy 기본값). 다섯 개를 처음부터 띄우면 앱 시작 때 요청 13개가
      // 한꺼번에 나가고(여행 목록만 3번) 화면이 끊겼다. 기본값으로 바꾸자 실기기에서 시작 요청 6개,
      // 끊긴 화면 비율 26~28% → 15~17%였고 탭을 바꿀 때 빈 화면은 보이지 않았다(11/10 갤럭시, 개발 빌드)
      // 탭 사이는 짧게 겹쳐 바뀐다(2026-11-11 사용자 결정). 길면 탭이 굼떠 보여 빠름 기준값 가까이로 둔다
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        transitionSpec: { animation: 'timing', config: { duration: TAB_FADE_MS } },
      }}
      tabBar={({ state, navigateToTab }) => (
        <TabBar
          active={TAB_BY_ROUTE[state.routes[state.index].name] ?? 'home'}
          onChange={(key) => {
            const route = state.routes.find((r) => r.name === ROUTE_BY_TAB[key]);
            if (route) navigateToTab(route.key);
          }}
        />
      )}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="trips" />
      <Tabs.Screen name="saved" />
      <Tabs.Screen name="chats" />
      <Tabs.Screen name="me" />
    </Tabs>
  );
}
