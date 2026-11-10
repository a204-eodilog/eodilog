import type { PhotoTopic, TripPhoto } from './types';

/** S32에서 아직 저장하지 않은 바꿈. 사진 id → 바꿀 값 */
export type PhotoEdits = Readonly<Record<string, { topic?: PhotoTopic; placeId?: string }>>;

/** 고른 사진에 같은 바꿈을 더한다(고른 사진마다 덮어씀) */
export function stageEdit(
  edits: PhotoEdits,
  photoIds: Iterable<string>,
  change: { topic?: PhotoTopic; placeId?: string },
): PhotoEdits {
  const next: Record<string, { topic?: PhotoTopic; placeId?: string }> = { ...edits };
  for (const id of photoIds) next[id] = { ...next[id], ...change };
  return next;
}

/** 바꾼 값을 얹은 사진(화면에 보일 값) */
export function withEdits(photo: TripPhoto, edits: PhotoEdits): TripPhoto {
  const e = edits[photo.id];
  if (!e) return photo;
  return {
    ...photo,
    ...(e.topic ? { topics: [e.topic] } : {}),
    ...(e.placeId ? { placeId: e.placeId } : {}),
  };
}

/**
 * 고른 사진의 주제가 모두 같으면 그 주제(칩을 켜 둔다), 다르거나 없으면 null.
 * 주제는 하나만 고르게 해서(값 문서 칩) 여러 주제가 붙은 사진은 첫 주제로 본다
 */
export function commonTopic(photos: readonly TripPhoto[]): PhotoTopic | null {
  const first = photos[0]?.topics[0] ?? null;
  return first && photos.every((p) => p.topics.length > 0 && p.topics[0] === first) ? first : null;
}

/** 저장할 PATCH 목록. 지금 값과 같으면 보내지 않는다 */
export function pendingChanges(
  photos: readonly TripPhoto[],
  edits: PhotoEdits,
): { photo: TripPhoto; change: { topics?: PhotoTopic[]; placeId?: string } }[] {
  return photos.flatMap((photo) => {
    const e = edits[photo.id];
    if (!e) return [];
    const change: { topics?: PhotoTopic[]; placeId?: string } = {};
    if (e.topic && !(photo.topics.length === 1 && photo.topics[0] === e.topic)) {
      change.topics = [e.topic];
    }
    if (e.placeId && e.placeId !== photo.placeId) change.placeId = e.placeId;
    return Object.keys(change).length > 0 ? [{ photo, change }] : [];
  });
}
