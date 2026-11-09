import type { Place } from '@/features/place/types';
import type { Region } from '@/features/trip/types';

import type { RecommendationItem, RecommendationResult } from './types';

/** 자료 부족 문구의 기준값. 서버 판정(insufficientData)과 별개로 디자인 값을 보인다(Q-9-5) */
export const MIN_PLACES = 3;
export const MIN_PEOPLE = 2;

/** 작업 확인 간격과 제한 시간 */
export const POLL_MS = 1500;
export const TIMEOUT_MS = 120_000;

export type RegionPick = { region: Region; reason: string };
export type PlacePick = { place: Place; reason: string };

/** 여행지와 맛집·스팟으로 나눈다. 지역이나 장소가 비어 있는 항목은 뺀다 */
export function splitItems(items: readonly RecommendationItem[]): {
  regions: RegionPick[];
  places: PlacePick[];
} {
  const regions: RegionPick[] = [];
  const places: PlacePick[] = [];
  for (const i of items) {
    if (i.type === 'REGION' && i.region) regions.push({ region: i.region, reason: i.reason });
    if (i.type === 'PLACE' && i.place) places.push({ place: i.place, reason: i.reason });
  }
  return { regions, places };
}

export type ViewState = 'loading' | 'success' | 'noOverlap' | 'insufficient' | 'failed';

/**
 * 화면 상태. 작업이 끝나기 전이면 loading, 실패·취소·제한 시간이면 failed.
 * 끝났으면 자료 부족이 먼저고, 그룹 겹친 곳이 0이면 겹침 없음(Q-9-4)
 */
export function viewState(
  result: RecommendationResult | null,
  failed: boolean,
  overlapCount: number | null,
): ViewState {
  if (failed) return 'failed';
  if (!result || result.job.status === 'QUEUED' || result.job.status === 'RUNNING')
    return 'loading';
  if (result.job.status !== 'SUCCEEDED') return 'failed';
  if (result.insufficientData) return 'insufficient';
  return overlapCount === 0 ? 'noOverlap' : 'success';
}

/**
 * 생성 중 몇 번째 단계인지(0·1·2). 서버가 단계를 주지 않아 흐른 시간으로 넘긴다.
 * progress가 오면 33·66을 넘을 때 앞당긴다
 */
export function loadingStep(elapsedMs: number, progress = 0): 0 | 1 | 2 {
  if (elapsedMs >= 5000 || progress >= 66) return 2;
  if (elapsedMs >= 2000 || progress >= 33) return 1;
  return 0;
}

const NATIVE = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];

/** "세 사람". 열 명이 넘으면 "11명" */
export function peopleWord(n: number): string {
  if (n <= 0) return '동행';
  return n <= 10 ? `${NATIVE[n]} 사람` : `${n}명`;
}

/** 생성 중 세 단계 문구 */
export function loadingSteps(placeCount: number, peopleCount: number): [string, string, string] {
  return [
    placeCount > 0 ? `모은 장소 ${placeCount}곳 살펴보기` : '모은 장소 살펴보기',
    `${peopleWord(peopleCount)} 취향 맞춰 보기`,
    '여행지와 장소 고르기',
  ];
}

/** 자료 부족 두 줄 */
export function insufficientLines(basis: RecommendationResult['basis']): [string, string] {
  return [
    `모은 장소 ${basis.sharedPlaceCount}곳 · ${MIN_PLACES}곳부터 추천해요`,
    `취향 고른 사람 ${basis.usedMemberCount}명 · ${MIN_PEOPLE}명부터 추천해요`,
  ];
}

export type BasisCell = { value: string; extra?: string; label: string };

/** 이번 추천에 쓴 것 세 칸. 겹침 수는 그룹 즐겨찾기 합계에서 온다(basis에 없음) */
export function basisCells(
  basis: RecommendationResult['basis'],
  overlapCount: number | null,
  regionName: string | null,
  period: string | null,
): [BasisCell, BasisCell, BasisCell] {
  return [
    {
      value: `${basis.sharedPlaceCount}곳`,
      ...(overlapCount ? { extra: `겹침 ${overlapCount}` } : {}),
      label: '모은 장소',
    },
    { value: `${basis.usedMemberCount}명`, label: '공개 취향' },
    { value: regionName || '여행지 미정', label: period ?? '기간 미정' },
  ];
}
