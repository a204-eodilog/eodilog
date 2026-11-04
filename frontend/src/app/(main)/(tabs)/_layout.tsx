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

/** 하단 탭 5개. 탭 첫 화면만 여기 두고, 상세·입력 화면은 (main) Stack에 둬서 탭이 보이지 않게 한다 */
export default function TabsLayout() {
  return (
    <Tabs
      // lazy: false로 탭 화면 다섯 개를 처음부터 띄워 둔다. 여행 목록도 미리 받아 둔다.
      // 안드로이드는 기본으로 보이지 않는 탭 화면을 화면 트리에서 떼어 두는데(detachInactiveScreens),
      // 탭을 바꿀 때 다시 붙이며 빈 화면이 잠깐 보인다. 탭이 다섯 개뿐이라 모두 붙여 둔다
      detachInactiveScreens={false}
      screenOptions={{ headerShown: false, lazy: false }}
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
