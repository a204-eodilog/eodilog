import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ImageViewer } from '@/components/ui/image-viewer';
import { PlaceInfoSheet, usePlaceSave } from '@/features/place';
import { useSavedPlaceIds, useUnsavePlace } from '@/features/saved';

import { FeedDetailView } from '../components/feed-detail-view';
import { useFeed } from '../hooks/use-feed';

/** S07 친구 여행 상세 /feeds/[feedId] */
export function FeedDetailScreen() {
  const { feedId } = useLocalSearchParams<{ feedId: string }>();
  const feed = useFeed(feedId ?? '');
  const [placeId, setPlaceId] = useState<string | null>(null);
  // 개인 즐겨찾기에 담아 둔 곳은 책갈피를 채워 보인다. 채운 책갈피를 누르면 다시 저장하지 않고 해제한다
  const savedPlaceIds = useSavedPlaceIds();
  const unsave = useUnsavePlace();
  const placeSave = usePlaceSave();
  // 크게 볼 사진의 순서. null이면 닫힘
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  return (
    <>
      <FeedDetailView
        state={feed.state}
        detail={feed.detail}
        onRetry={feed.retry}
        onLike={feed.toggleLike}
        onPhotos={setPhotoIndex}
        savedPlaceIds={savedPlaceIds}
        onSavePlace={(stop) =>
          savedPlaceIds.has(stop.placeId)
            ? unsave(stop.placeId)
            : placeSave.open({ id: stop.placeId, name: stop.name })
        }
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
      <ImageViewer
        images={feed.detail?.photos ?? []}
        index={photoIndex}
        onClose={() => setPhotoIndex(null)}
      />
    </>
  );
}
