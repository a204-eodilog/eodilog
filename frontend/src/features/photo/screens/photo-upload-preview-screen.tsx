import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { toast } from '@/components/ui';

import { PhotoUploadView } from '../components/photo-upload-view';
import type { UploadPhase } from '../hooks/use-photo-upload';
import type { PickedPhoto, UploadItem, UploadStatus } from '../types';

/** 사진 자리. 개발 화면은 기기 사진이 없어 빈 칸(회색)으로 그린다 */
const PHOTOS: PickedPhoto[] = Array.from({ length: 12 }, (_, i) => ({
  key: `p${i + 1}`,
  uri: '',
  contentType: 'image/jpeg',
  byteSize: 1,
  capturedAt: null,
}));

const items = (status: (i: number) => UploadStatus): UploadItem[] =>
  PHOTOS.map((photo, i) => ({ photo, status: status(i), assetId: null, ready: false }));

/**
 * /dev/photo-upload?state=empty|pick|uploading|failed. S30 상태별 모양을 서버·기기 사진 없이 본다.
 * uploading은 1초마다 한 장씩 올라간다
 */
export function PhotoUploadPreviewScreen() {
  const { state = 'pick' } = useLocalSearchParams<{ state?: string }>();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(PHOTOS.slice(0, 10).map((p) => p.key)),
  );
  const [done, setDone] = useState(4);

  useEffect(() => {
    if (state !== 'uploading') return;
    const timer = setInterval(() => setDone((n) => (n >= PHOTOS.length ? 4 : n + 1)), 1000);
    return () => clearInterval(timer);
  }, [state]);

  if (!__DEV__) return <Redirect href="/" />;

  const phase: UploadPhase =
    state === 'uploading' ? 'uploading' : state === 'failed' ? 'failed' : 'pick';
  return (
    <PhotoUploadView
      tripTitle="겨울 여행"
      phase={phase}
      picked={state === 'empty' ? [] : PHOTOS}
      selected={selected}
      items={
        state === 'failed'
          ? items((i) => (i === 3 || i === 8 ? 'failed' : 'done'))
          : items((i) => (i < done ? 'done' : i === done ? 'uploading' : 'waiting'))
      }
      onBack={() => toast.show('앞 화면으로 돌아가요')}
      onPick={() => toast.show('기기 사진 선택창을 열어요')}
      onToggle={(key) =>
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        })
      }
      onUpload={() => toast.show(`${selected.size}장을 올려요`)}
      onCancel={() => toast.show('올리기를 멈출지 물어봐요')}
      onRetry={() => toast.show('실패한 2장을 다시 올려요')}
      onLater={() => toast.show('앞 화면으로 돌아가요')}
    />
  );
}
