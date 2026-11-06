import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { toast } from '@/components/ui';

import { FeedDetailView } from '../components/feed-detail-view';
import { toFeedDetail } from '../feed-rules';
import { sampleFeed } from '../preview-data';

type PreviewState = 'basic' | 'loading' | 'error';

const say = (m: string) => () => toast.show(m);

/**
 * /dev/feed?state=basic|loading|error
 * Figma S07 기본을 예시 값으로 본다. 서버에 요청하지 않는다. 좋아요는 화면에서만 바뀐다
 */
export function FeedPreviewScreen() {
  const { state = 'basic' } = useLocalSearchParams<{ state?: PreviewState }>();
  const [feed, setFeed] = useState(sampleFeed);
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <FeedDetailView
      state={state === 'basic' ? 'ready' : state}
      detail={state === 'basic' ? toFeedDetail(feed) : undefined}
      onRetry={say('다시 불러와요')}
      onLike={() =>
        setFeed((f) => ({
          ...f,
          likedByMe: !f.likedByMe,
          likeCount: f.likeCount + (f.likedByMe ? -1 : 1),
        }))
      }
      onPhotos={say('사진 모두 보기로 가요')}
      onSavePlace={(s) => toast.show(`${s.name}: S08 장소 저장 시트를 열어요`)}
      onPlace={(s) => toast.show(`${s.name}: N7 장소 정보 시트를 열어요`)}
    />
  );
}
