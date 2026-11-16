import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ConfirmSheet, toast } from '@/components/ui';
import { GalleryAiPanel } from '@/features/ondevice/components/gallery-ai-panel';
import { toPickedPhoto } from '@/features/ondevice/gallery-ai';
import { tripTimeRange } from '@/features/ondevice/search-rules';
import { useGalleryAi } from '@/features/ondevice/use-gallery-ai';
import { getSettings } from '@/features/settings/api';
import { SETTINGS_QUERY_KEY } from '@/features/settings/hooks/use-server-settings';

import { applyDeviceClassification, getTrip, type DevicePhotoResult } from '../api';
import { PhotoUploadView } from '../components/photo-upload-view';
import { usePhotoUpload } from '../hooks/use-photo-upload';
import {
  addPickedPhotos,
  inBatches,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  PHOTO_PICK_QUALITY,
  skippedMessage,
} from '../photo-rules';
import type { PhotoTopic, PickedPhoto, UploadItem } from '../types';

/**
 * S30 사진 선택·업로드(/trips/[tripId]/photos/upload). S17 [사진 올리기]·S33 [사진 올리기]에서 온다.
 * 다 올리면·[나중에]·[올리기 취소] 뒤에는 S31로 간다(뒤에 S31이 있으면 그리로 돌아가고, 없으면 S30 자리에 S31).
 * 올리는 중 [뒤로]·기기 뒤로는 '올리기 취소' 확인
 */
export function PhotoUploadScreen() {
  const { tripId = '' } = useLocalSearchParams<{ tripId: string }>();
  const trip = useQuery({
    queryKey: ['trips', tripId, 'photos', 'trip'],
    queryFn: () => getTrip(tripId),
    enabled: !!tripId,
  });
  // 폰 AI: 여행 기간에 찍은 내 폰 사진을 폰에서 정리하고(주제·비슷한 사진·문장 검색) 골라 담는다
  const settings = useQuery({ queryKey: SETTINGS_QUERY_KEY, queryFn: getSettings });
  const ranges = useMemo(() => {
    const r = tripTimeRange(trip.data?.startDate ?? null, trip.data?.endDate ?? null);
    return r ? [r] : null;
  }, [trip.data?.startDate, trip.data?.endDate]);
  const gallery = useGalleryAi({ ranges, aiMode: settings.data?.ai.photoClassification });
  // 폰 AI로 담은 사진의 분석 결과(기기 사진 id → 주제·묶음 키). 다 올린 뒤 서버에 결과만 보낸다
  const deviceResults = useRef(new Map<string, { topic: PhotoTopic; groupKey: string | null }>());
  const upload = usePhotoUpload(tripId);
  const [picked, setPicked] = useState<PickedPhoto[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const uploading = upload.phase === 'uploading';
  // 올리는 중에 기기 뒤로·뒤로 몸짓으로 나가려 하면 확인을 띄운다
  usePreventRemove(uploading && !leaving, () => setConfirmCancel(true));

  // 취소·나중에: 막기를 푼 다음 화면에서 S31로
  useEffect(() => {
    if (leaving) router.dismissTo(`/trips/${tripId}/photos`);
  }, [leaving, tripId]);

  // 다 올리면(이때는 막기가 이미 풀려 있다) 토스트와 함께 S31로
  useEffect(() => {
    if (upload.phase !== 'done') return;
    void sendDeviceResults(tripId, upload.items, deviceResults.current);
    toast.success(`사진 ${upload.items.length}장을 올렸어요`);
    router.dismissTo(`/trips/${tripId}/photos`);
  }, [upload.phase, upload.items, tripId]);

  const pick = async () => {
    const remaining = MAX_PHOTOS - picked.length;
    if (remaining <= 0) {
      toast.show(`한 번에 ${MAX_PHOTOS}장까지 올릴 수 있어요`);
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        orderedSelection: true,
        exif: true,
        quality: PHOTO_PICK_QUALITY,
      });
      if (result.canceled) return;
      const { photos, skipped } = addPickedPhotos(picked, result.assets);
      const added = photos.slice(picked.length);
      setPicked(photos);
      setSelected((prev) => new Set([...prev, ...added.map((p) => p.key)]));
      const message = skippedMessage(skipped);
      if (message) toast.show(message);
    } catch {
      toast.error('사진을 불러오지 못했어요');
    }
  };

  /** 폰 AI에서 고른 사진을 고른 목록에 더한다(이미 있는 사진·15MB 초과·50장 넘는 사진은 뺀다) */
  const addFromGallery = async () => {
    const chosen = gallery.selectedPhotos();
    const have = new Set(picked.map((p) => p.key));
    const next = [...picked];
    let over = 0;
    for (const g of chosen) {
      if (have.has(g.id)) continue;
      if (next.length >= MAX_PHOTOS) {
        over += 1;
        continue;
      }
      const photo = await toPickedPhoto(g).catch(() => null);
      if (!photo || photo.byteSize > MAX_PHOTO_BYTES) continue;
      const result = gallery.resultFor(g.id);
      if (result) deviceResults.current.set(photo.key, result);
      next.push(photo);
    }
    const added = next.slice(picked.length);
    setPicked(next);
    setSelected((prev) => new Set([...prev, ...added.map((p) => p.key)]));
    gallery.clearSelection();
    if (over > 0) toast.show(`한 번에 ${MAX_PHOTOS}장까지 올릴 수 있어요`);
    // 읽을 수 없거나 너무 큰 사진은 조용히 빠지지 않게 알린다
    else if (added.length < chosen.filter((g) => !have.has(g.id)).length)
      toast.show(added.length === 0 ? '사진을 담지 못했어요' : '일부 사진은 담지 못했어요');
  };

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const leaveAfterCancel = () => {
    const done = upload.cancel();
    setConfirmCancel(false);
    if (done > 0) toast.show(`${done}장은 올라갔어요`);
    setLeaving(true);
  };

  return (
    <>
      <PhotoUploadView
        tripTitle={trip.data?.title ?? null}
        phase={upload.phase}
        picked={picked}
        selected={selected}
        items={upload.items}
        onBack={() => (uploading ? setConfirmCancel(true) : router.back())}
        onPick={() => void pick()}
        onToggle={toggle}
        onUpload={() => upload.start(picked.filter((p) => selected.has(p.key)))}
        onCancel={() => setConfirmCancel(true)}
        onRetry={upload.retryFailed}
        renderGalleryAi={(tile, gap) => (
          <GalleryAiPanel
            ai={gallery}
            tile={tile}
            gap={gap}
            mode="pick"
            title="폰에서 이 여행 사진 정리하기"
            onAdd={() => void addFromGallery()}
          />
        )}
        onLater={() => {
          const done = upload.items.filter((i) => i.status === 'done').length;
          if (done > 0) toast.show(`${done}장은 올라갔어요`);
          setLeaving(true);
        }}
      />
      <ConfirmSheet
        visible={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={leaveAfterCancel}
        title="올리기를 멈출까요?"
        description="이미 올린 사진은 남고, 아직 안 올린 사진은 올라가지 않아요"
        confirmLabel="올리기 취소"
        cancelLabel="계속 올리기"
      />
    </>
  );
}

/**
 * 다 올린 뒤 폰 AI 결과(주제·비슷한 사진 묶음)를 서버에 보낸다. 사진이 아니라 결과만 간다.
 * 실패해도 사진은 이미 올라갔으니 조용히 넘어간다(주제는 S32에서 직접 고칠 수 있다)
 */
async function sendDeviceResults(
  tripId: string,
  items: readonly UploadItem[],
  results: ReadonlyMap<string, { topic: PhotoTopic; groupKey: string | null }>,
) {
  const photos: DevicePhotoResult[] = items.flatMap((item) => {
    const r = results.get(item.photo.key);
    return item.status === 'done' && item.registered && r
      ? [{ photoId: item.registered.id, expectedVersion: item.registered.version, ...r }]
      : [];
  });
  for (const batch of inBatches(photos)) {
    try {
      await applyDeviceClassification(tripId, batch);
    } catch {
      // 409(AI 분류 끔, 버전 다름)나 연결 실패는 무시한다
    }
  }
}
