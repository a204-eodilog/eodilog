import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import { toast } from '@/components/ui';

import { PhotoViewer } from '../components/photo-viewer';
import { TripPhotosView } from '../components/trip-photos-view';
import { UnplacedPhotosView } from '../components/unplaced-photos-view';
import { useConnectPlace, useTripPhotos } from '../hooks/use-trip-photos';
import {
  courseDays,
  filterByTopic,
  uploadSummaryText,
  type TopicFilter,
} from '../photo-list-rules';
import type { TripPhoto } from '../types';

/**
 * S31 여행 사진 목록(/trips/[tripId]/photos). S17 '사진'·S30 업로드 완료에서 온다.
 * 사진 칸을 누르면 크게 보기(묶음 S32는 서버가 묶음을 지원하면 붙인다). [공동 피드 게시] → S38
 */
export function TripPhotosScreen() {
  const { tripId = '' } = useLocalSearchParams<{ tripId: string }>();
  const data = useTripPhotos(tripId);
  const [topic, setTopic] = useState<TopicFilter>('ALL');
  const [viewing, setViewing] = useState<TripPhoto | null>(null);

  const filtered = useMemo(() => filterByTopic(data.photos, topic), [data.photos, topic]);
  const viewingPlace = viewing?.placeId ? data.group([viewing])[0]?.name : null;

  return (
    <>
      <TripPhotosView
        state={data.state}
        tripTitle={data.trip?.title ?? null}
        chips={data.chips}
        topic={topic}
        sections={data.group(filtered)}
        unplaced={data.unplaced}
        totalCount={data.photos.length}
        footer={uploadSummaryText(data.photos)}
        memberName={data.memberName}
        myMemberId={data.myMemberId}
        onBack={() => router.back()}
        onUpload={() => router.push(`/trips/${tripId}/photos/upload`)}
        onTopic={setTopic}
        onUnplaced={() => router.push(`/trips/${tripId}/photos/unplaced`)}
        onPhoto={setViewing}
        onEditSection={(placeId) => router.push(`/trips/${tripId}/photos/place/${placeId}`)}
        onPublish={() => router.push(`/trips/${tripId}/record`)}
        onRetry={data.retry}
      />
      <PhotoViewer
        photo={viewing}
        caption={
          viewing
            ? [`${data.memberName(viewing.uploaderMemberId)}님이 올림`, viewingPlace]
                .filter(Boolean)
                .join(' · ')
            : ''
        }
        onClose={() => setViewing(null)}
      />
    </>
  );
}

/**
 * S31 장소 미지정 묶음(/trips/[tripId]/photos/unplaced). 내 사진을 골라 코스 장소에 연결하고 S31로 돌아간다.
 * 남의 사진은 서버가 올린 사람만 바꿀 수 있게 해서 고를 수 없다
 */
export function UnplacedPhotosScreen() {
  const { tripId = '' } = useLocalSearchParams<{ tripId: string }>();
  const data = useTripPhotos(tripId);
  const connect = useConnectPlace(tripId);
  const mine = useMemo(
    () => data.unplaced.filter((p) => p.uploaderMemberId === data.myMemberId),
    [data.unplaced, data.myMemberId],
  );
  // 기본은 내 사진 모두 고른 상태. 사용자가 고친 뒤로는 그 고르기를 쓴다
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const selected = useMemo(() => picked ?? new Set(mine.map((p) => p.id)), [picked, mine]);
  const [placeId, setPlaceId] = useState<string | null>(null);

  // 한 번만 나간다(연결 성공과 목록이 비는 것이 겹쳐도)
  const left = useRef(false);
  const leave = () => {
    if (left.current) return;
    left.current = true;
    router.back();
  };
  // 사진이 모두 연결돼 비면 S31로 돌아간다(다른 기기에서 연결한 경우 포함)
  const empty = data.state === 'ready' && data.unplaced.length === 0;
  useEffect(() => {
    if (empty && !connect.isPending && !left.current) {
      left.current = true;
      router.back();
    }
  }, [empty, connect.isPending]);

  const toggle = (id: string) =>
    setPicked(() => {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = () => {
    if (!placeId) return;
    const photos = mine.filter((p) => selected.has(p.id));
    connect.mutate(
      { photos, placeId },
      {
        onSuccess: ({ connected, failed }) => {
          if (failed === 0) {
            toast.success(`사진 ${connected}장을 연결했어요`);
            leave();
          } else {
            toast.error(`${failed}장을 연결하지 못했어요. 다시 시도해 주세요`);
            setPicked(null);
          }
        },
      },
    );
  };

  return (
    <UnplacedPhotosView
      state={data.state}
      onRetry={data.retry}
      tripTitle={data.trip?.title ?? null}
      photos={data.unplaced}
      selected={selected}
      days={courseDays(data.course, data.trip?.startDate ?? null)}
      courseState={data.courseState as 'loading' | 'error' | 'ready'}
      placeId={placeId}
      saving={connect.isPending}
      memberName={data.memberName}
      myMemberId={data.myMemberId}
      onBack={() => router.back()}
      onToggle={toggle}
      onPlace={setPlaceId}
      onConnect={run}
    />
  );
}
