import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { toast } from '@/components/ui';
import { PlaceInfoSheet, usePlaceSave } from '@/features/place';

import { FeedDetailView } from '../components/feed-detail-view';
import { useFeed } from '../hooks/use-feed';

// 사진 모두 보기는 아직 없다
const soon = () => toast.show('준비 중이에요');

/** S07 친구 여행 상세 /feeds/[feedId] */
export function FeedDetailScreen() {
  const { feedId } = useLocalSearchParams<{ feedId: string }>();
  const feed = useFeed(feedId ?? '');
  const [placeId, setPlaceId] = useState<string | null>(null);
  const placeSave = usePlaceSave();
  return (
    <>
      <FeedDetailView
        state={feed.state}
        detail={feed.detail}
        onRetry={feed.retry}
        onLike={feed.toggleLike}
        onPhotos={soon}
        onSavePlace={(stop) => placeSave.open({ id: stop.placeId, name: stop.name })}
        onPlace={(stop) => setPlaceId(stop.placeId)}
      />
      <PlaceInfoSheet
        placeId={placeId}
        onClose={() => setPlaceId(null)}
        onSave={(place) => {
          setPlaceId(null);
          placeSave.open(place);
        }}
      />
      {placeSave.sheet}
    </>
  );
}
