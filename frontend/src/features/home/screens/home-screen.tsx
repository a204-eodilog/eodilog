import { router } from 'expo-router';

import { toast } from '@/components/ui';
import { HomeView } from '@/features/home/components/home-view';
import { useHome } from '@/features/home/hooks/use-home';

const soon = () => toast.show('준비 중이에요');

/** S05 홈 친구 여행 지도 */
export function HomeScreen() {
  const home = useHome();
  return (
    <HomeView
      state={home.state}
      marks={home.marks}
      recommendations={home.recommendations}
      recommendationsStatus={home.recommendationsStatus}
      unreadCount={home.unreadCount}
      friendCount={null}
      onRetry={home.retry}
      onTrend={soon}
      onBell={soon}
      // S44 친구 찾기가 생기기 전까지 S43 친구 목록으로
      onFindFriends={() => router.push('/friends')}
      onNewTrip={() => router.push('/trips/new')}
      onRegion={soon}
      onRecommendation={soon}
    />
  );
}
