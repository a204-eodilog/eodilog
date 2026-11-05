import { useLocalSearchParams } from 'expo-router';

import { toast } from '@/components/ui';

import { FeedDetailView } from '../components/feed-detail-view';
import { useFeed } from '../hooks/use-feed';

// S08 장소 저장 시트·사진 모두 보기·N7 장소 정보는 아직 없다
const soon = () => toast.show('준비 중이에요');

/** S07 친구 여행 상세 /feeds/[feedId] */
export function FeedDetailScreen() {
  const { feedId } = useLocalSearchParams<{ feedId: string }>();
  const feed = useFeed(feedId ?? '');
  return (
    <FeedDetailView
      state={feed.state}
      detail={feed.detail}
      onRetry={feed.retry}
      onLike={feed.toggleLike}
      onPhotos={soon}
      onSavePlace={soon}
      onPlace={soon}
    />
  );
}
