import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useState } from 'react';

import { ConfirmSheet, toast } from '@/components/ui';

import { getTripTitle } from '../api';
import { PhotoUploadView } from '../components/photo-upload-view';
import { usePhotoUpload } from '../hooks/use-photo-upload';
import { addPickedPhotos, MAX_PHOTOS, PHOTO_PICK_QUALITY, skippedMessage } from '../photo-rules';
import type { PickedPhoto } from '../types';

/**
 * S30 사진 선택·업로드(/trips/[tripId]/photos/upload). S17 [사진 올리기]·S33 [사진 올리기]에서 온다.
 * 다 올리면·[나중에]·[올리기 취소] 뒤에는 S31로 간다(뒤에 S31이 있으면 그리로 돌아가고, 없으면 S30 자리에 S31).
 * 올리는 중 [뒤로]·기기 뒤로는 '올리기 취소' 확인
 */
export function PhotoUploadScreen() {
  const { tripId = '' } = useLocalSearchParams<{ tripId: string }>();
  const title = useQuery({
    queryKey: ['trips', tripId, 'title'],
    queryFn: () => getTripTitle(tripId),
    enabled: !!tripId,
  });
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
    toast.success(`사진 ${upload.items.length}장을 올렸어요`);
    router.dismissTo(`/trips/${tripId}/photos`);
  }, [upload.phase, upload.items.length, tripId]);

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
        tripTitle={title.data ?? null}
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
