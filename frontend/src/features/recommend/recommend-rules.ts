import type { Place } from '@/features/place/types';
import { shortRegionName } from '@/features/trip/trip-rules';
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

/** 자료 부족 한 줄: 무엇이, 지금 얼마이고, 얼마가 있어야 하는지. met이면 이 조건은 채웠다 */
export type InsufficientRow = { label: string; now: string; need: string; met: boolean };

/**
 * 자료 부족 두 줄(모은 장소, 취향 고른 사람). 한 문장에 가운뎃점으로 이어 쓰면 무엇이 모자란지 읽기 어려워
 * (2026-11-14 사용자 지적) "지금 / 필요"로 나눠 준다
 */
export function insufficientRows(
  basis: RecommendationResult['basis'],
): [InsufficientRow, InsufficientRow] {
  return [
    {
      label: '모은 장소',
      now: `${basis.sharedPlaceCount}곳`,
      need: `${MIN_PLACES}곳`,
      met: basis.sharedPlaceCount >= MIN_PLACES,
    },
    {
      label: '취향 고른 사람',
      now: `${basis.usedMemberCount}명`,
      need: `${MIN_PEOPLE}명`,
      met: basis.usedMemberCount >= MIN_PEOPLE,
    },
  ];
}

/** 자료 부족 안내 한 문장. 얼마나 모이면 추천하는지 */
export const INSUFFICIENT_HINT = `장소 ${MIN_PLACES}곳, 취향 고른 사람 ${MIN_PEOPLE}명부터 추천해요`;

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

/** 시·도 이름. "도"로 끝나는 낱말은 "영도"처럼 시·도가 아닐 수 있어 도는 이름을 모두 적는다 */
const METRO = /(특별시|광역시|특별자치시|특별자치도)$/;
const DO_PROVINCES = new Set([
  '경기도',
  '강원도',
  '충청북도',
  '충청남도',
  '전라북도',
  '전라남도',
  '경상북도',
  '경상남도',
]);
const isProvince = (word: string) => METRO.test(word) || DO_PROVINCES.has(word);

/**
 * 여행지 추천 카드의 제목과 위치 줄. "강원특별자치도 강릉시" → 제목 "강릉시", 위치 "강원".
 * 위치는 그 지역이 속한 시·도라 여행의 첫 여행지를 붙이지 않는다.
 * 첫 낱말이 시·도가 아니면("영도 흰여울 일대") 이름을 그대로 제목으로 쓰고 위치 줄은 없다
 */
export function regionCardText(fullName: string): { title: string; location: string | null } {
  const name = fullName.trim();
  const [first, ...rest] = name.split(/\s+/);
  if (rest.length === 0 || !isProvince(first)) return { title: name, location: null };
  return { title: rest.join(' '), location: provinceShort(first) };
}

/** 두 글자로 줄여 부르는 도. 나머지는 "특별자치도", "광역시" 같은 꼬리만 뗀다 */
const PROVINCE_SHORT: Record<string, string> = {
  전라남도: '전남',
  전라북도: '전북',
  전북특별자치도: '전북',
  경상남도: '경남',
  경상북도: '경북',
  충청남도: '충남',
  충청북도: '충북',
  전남광주통합특별시: '전남',
};

function provinceShort(name: string): string {
  return PROVINCE_SHORT[name] ?? shortRegionName(name);
}
