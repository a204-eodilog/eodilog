import { router } from 'expo-router';

import { MyPageView } from '../components/mypage-view';
import { useMyPage } from '../hooks/use-mypage';

/** S37 마이페이지 탭 */
export function MyPageScreen() {
  const page = useMyPage();
  return (
    <MyPageView
      state={page.state}
      summary={page.summary}
      onRetry={page.retry}
      onTrips={() => router.push('/my-trips')}
      onNewTrip={() => router.push('/trips/new')}
      onTimeline={() => router.push('/timeline')}
      onFriends={() => router.push('/friends')}
      onSettings={() => router.push('/settings')}
      // 게시한 여행은 S07(피드 ID를 아직 핀에 싣지 않음), 게시 전은 여행 상세. 1차는 내 여행 목록으로
      onPin={() => router.push('/my-trips')}
    />
  );
}
