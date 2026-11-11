import { router, type Href } from 'expo-router';

/**
 * (main) 안의 화면을 탭 화면 위에 연다. 앱을 쓰던 중이면 이미 있는 탭 화면 위로 돌아가 열고(dismissTo),
 * 링크로 앱을 막 켜 아래에 탭 화면이 없으면 (main)의 첫 화면인 탭 화면을 깔고 연다(withAnchor,
 * app/(main)/_layout의 unstable_settings). replace는 탭 묶음을 하나 더 만들어 뒤로 가기에 같은 탭 화면이
 * 두 번 나온다. 초대 확인(S04) 뒤 이동, 볼 수 없는 여행에서 여행 목록으로 갈 때 쓴다
 */
export function openOverTabs(href: Href) {
  router.dismissTo(href, { withAnchor: true });
}
