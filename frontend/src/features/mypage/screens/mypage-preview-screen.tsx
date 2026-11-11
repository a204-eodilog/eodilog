import { Redirect, useLocalSearchParams } from 'expo-router';

import { toast } from '@/components/ui';

import { MyPageView } from '../components/mypage-view';
import { PREVIEW_EMPTY, PREVIEW_SUMMARY } from '../preview-data';

type PreviewState = 'basic' | 'empty' | 'loading' | 'error';
const say = (m: string) => () => toast.show(m);

/** /dev/mypage?state=basic|empty|loading|error. 예시 값으로 Figma S37을 본다 */
export function MyPagePreviewScreen() {
  const { state = 'basic' } = useLocalSearchParams<{ state?: PreviewState }>();
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <MyPageView
      state={state === 'basic' ? 'ready' : state}
      summary={state === 'empty' ? PREVIEW_EMPTY : PREVIEW_SUMMARY}
      onRetry={say('다시 불러와요')}
      onTrips={say('N4 내 여행 목록으로 가요')}
      onNewTrip={say('S16 새 여행으로 가요')}
      onTimeline={say('S41 타임라인으로 가요')}
      onFriends={say('S43 친구 목록으로 가요')}
      onSettings={say('S45 설정으로 가요')}
      onPin={(p) => toast.show(`${p.label}: 여행으로 가요`)}
    />
  );
}
