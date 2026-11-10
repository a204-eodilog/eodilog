import type { TripPhoto } from '@/features/photo';

/** S38 사진 카드에 넣는 값. 썸네일은 올린 최신순 앞 4장 */
export type PhotoCardInfo = {
  /** "사진 32장". 아직 못 읽었으면 "사진" */
  title: string;
  /** "3명이 올렸어요" / "아직 올린 사진이 없어요". 아직 못 읽었으면 null */
  sub: string | null;
  thumbAssetIds: string[];
};

/** 사진 카드 썸네일 수(값 문서: 4개) */
export const PHOTO_CARD_THUMBS = 4;

/** 사진 목록(올린 최신순, 지운 사진 빠짐) → 사진 카드 값. 못 읽었으면(undefined) 머리 줄만 */
export function photoCardInfo(photos: readonly TripPhoto[] | undefined): PhotoCardInfo {
  if (!photos) return { title: '사진', sub: null, thumbAssetIds: [] };
  if (photos.length === 0)
    return { title: '사진', sub: '아직 올린 사진이 없어요', thumbAssetIds: [] };
  const uploaders = new Set(photos.map((p) => p.uploaderMemberId)).size;
  return {
    title: `사진 ${photos.length}장`,
    sub: `${uploaders}명이 올렸어요`,
    thumbAssetIds: photos.slice(0, PHOTO_CARD_THUMBS).map((p) => p.assetId),
  };
}
