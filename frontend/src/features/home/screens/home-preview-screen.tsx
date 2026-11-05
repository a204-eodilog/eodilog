import { Redirect, useLocalSearchParams } from 'expo-router';

import { toast } from '@/components/ui';
import { HomeView, type HomeViewProps } from '@/features/home/components/home-view';
import {
  PREVIEW_LOCKED,
  PREVIEW_MARKS,
  PREVIEW_RECOMMENDATIONS,
} from '@/features/home/preview-data';

type PreviewState = 'basic' | 'zoom' | 'sheet' | 'no-friends' | 'first' | 'no-public' | 'error';

const say = (m: string) => () => toast.show(m);

/**
 * /dev/home?state=basic|zoom|sheet|no-friends|first|no-public|error
 * Figma S05 7개 상태를 예시 값으로 본다. 서버에 요청하지 않는다
 */
export function HomePreviewScreen() {
  const { state = 'basic' } = useLocalSearchParams<{ state?: PreviewState }>();
  if (!__DEV__) return <Redirect href="/" />;

  const base: HomeViewProps = {
    state: 'ready',
    marks: PREVIEW_MARKS.slice(0, 4),
    recommendations: PREVIEW_RECOMMENDATIONS,
    unreadCount: 3,
    friendCount: 4,
    onRetry: say('다시 불러와요'),
    onTrend: say('S09 최근 트렌드 여행지로 가요'),
    onBell: say('S48 알림으로 가요'),
    onFindFriends: say('S44 친구 찾기로 가요'),
    onNewTrip: say('S16 새 여행으로 가요'),
    onRegion: (m) => toast.show(`${m.name}: S06 같은 지역 여행 목록으로 가요`),
    onRecommendation: (r) => toast.show(`${r.title}: S07 친구 여행 상세로 가요`),
  };
  const byState: Record<PreviewState, Partial<HomeViewProps>> = {
    basic: {},
    zoom: { marks: PREVIEW_MARKS, initialZoom: { regionCode: '5115000000', scale: 4.2 } },
    sheet: { initialSheetExpanded: true },
    'no-friends': { state: 'no-friends', marks: [] },
    first: { state: 'first-visit' },
    'no-public': { state: 'no-public', marks: [], lockedFriends: PREVIEW_LOCKED },
    error: { state: 'error' },
  };
  return <HomeView key={state} {...base} {...(byState[state] ?? {})} />;
}
