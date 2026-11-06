import { router } from 'expo-router';

import { toast } from '@/components/ui';
import { HomeView } from '@/features/home/components/home-view';
import { RegionTripsSheet } from '@/features/home/components/region-trips-sheet';
import { useHome } from '@/features/home/hooks/use-home';
import { useRegionTrips } from '@/features/home/hooks/use-region-trips';
import type { RegionMark } from '@/features/home/types';

const soon = () => toast.show('준비 중이에요');

/** S06 같은 지역 여행 목록 시트. 누른 지역마다 서버 목록을 받아 보인다 */
function RegionSheet({ marks, onClose }: { marks: readonly RegionMark[]; onClose: () => void }) {
  const trips = useRegionTrips(marks);
  return (
    <RegionTripsSheet
      groups={trips.groups}
      onClose={onClose}
      onTrip={(card) => router.push(`/feeds/${card.feedId}`)}
      onRetry={trips.retry}
    />
  );
}

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
      renderRegionSheet={(marks, onClose) => (
        <RegionSheet
          key={marks.map((m) => m.regionCode).join('-')}
          marks={marks}
          onClose={onClose}
        />
      )}
      onRecommendation={(r) => (r.kind === 'trip' ? router.push(`/feeds/${r.targetId}`) : soon())}
    />
  );
}
