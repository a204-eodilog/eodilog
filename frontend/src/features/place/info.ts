import { apiClient } from '@/api/client';
import type { DataResponse, PageResponse, UserCard } from '@/api/types';
import { withIga } from '@/lib/korean';

import type { Place } from './types';

/** GET /places/{placeId}/social-summary(PlaceSocialSummary). 허용된 게시물에서만 집계 */
export type PlaceSocialSummary = {
  place: Place;
  visitorCount: number;
  visitors: UserCard[];
  averageScore: number | null;
  reviewCount: number;
  partialErrors: string[];
};

/** GET /places/{placeId}/public-reviews 한 줄(PublishedReview)에서 쓰는 값 */
export type PlacePublicReview = {
  id: string;
  author: UserCard;
  score: number;
  body: string;
  writtenAt: string;
};

/** N7 화면 값 */
export type PlaceInfo = {
  placeId: string;
  name: string;
  /** "강릉 명주동". 주소가 없으면 null */
  address: string | null;
  /** 장소 사진. 명세에 장소 사진이 없어 지금은 비어 있다 */
  photoUrl: string | null;
  /** 들어온 곳이 알려 준 이유. 홈 추천이면 "좋아요한 여행과 비슷해요" */
  reason: string | null;
  /** "가람이 다녀왔어요", 여럿이면 "가람 외 2명이 다녀왔어요". 없으면 null */
  visitorsLine: string | null;
  firstVisitor: string | null;
  /** 평균 점수(소수 한 자리) */
  score: number | null;
  /** 가장 먼저 쓴 한 줄 평가 */
  review: string | null;
};

export async function getPlace(placeId: string): Promise<Place> {
  const { data } = await apiClient.get<DataResponse<Place>>(
    `/places/${encodeURIComponent(placeId)}`,
  );
  return data.data;
}

export async function getPlaceSocial(placeId: string): Promise<PlaceSocialSummary> {
  const { data } = await apiClient.get<DataResponse<PlaceSocialSummary>>(
    `/places/${encodeURIComponent(placeId)}/social-summary`,
  );
  return data.data;
}

export async function getPlaceReviews(placeId: string): Promise<PlacePublicReview[]> {
  const { data } = await apiClient.get<PageResponse<PlacePublicReview>>(
    `/places/${encodeURIComponent(placeId)}/public-reviews`,
    { params: { size: 10 } },
  );
  return data.data;
}

/**
 * 서버 응답 → N7 화면 값. 다녀간 친구·평점은 요약(social-summary)이 기준이고,
 * 한 줄 평가는 평가 목록에서 가장 먼저 쓴 것. 요약을 못 받으면 그 줄만 뺀다
 */
export function toPlaceInfo(input: {
  place: Place;
  social?: PlaceSocialSummary;
  reviews?: readonly PlacePublicReview[];
  reason?: string | null;
}): PlaceInfo {
  const names = input.social?.visitors.map((v) => v.nickname) ?? [];
  const count = Math.max(input.social?.visitorCount ?? 0, names.length);
  const first = [...(input.reviews ?? [])].sort((a, b) =>
    a.writtenAt.localeCompare(b.writtenAt),
  )[0];
  const avg = input.social?.averageScore;
  return {
    placeId: input.place.id,
    name: input.place.name,
    address: input.place.address,
    photoUrl: null,
    reason: input.reason ?? null,
    visitorsLine:
      count === 0
        ? null
        : names[0]
          ? count === 1
            ? `${withIga(names[0])} 다녀왔어요`
            : `${names[0]} 외 ${count - 1}명이 다녀왔어요`
          : `친구 ${count}명이 다녀왔어요`,
    firstVisitor: names[0] ?? null,
    score: avg === null || avg === undefined ? null : Math.round(avg * 10) / 10,
    review: first?.body ?? null,
  };
}
