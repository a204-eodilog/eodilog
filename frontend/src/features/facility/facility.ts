import { apiClient } from '@/api/client';
import type { DataResponse, PageResponse, Trip } from '@/api/types';

/** docs/api-spec.md Facility. 실시간 상태를 확인하지 못했으면 availability가 null */
export type Facility = {
  providerId: string;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  walkingSeconds: number | null;
  availability: string | null;
  queriedAt: string;
};

/**
 * 시설 유형(결정 Q-8: 종류·반경 미정). 서버 값이 정해지면 key만 맞춘다.
 * 화면 순서는 Figma S28 칩 순서
 */
export const FACILITY_TYPES = [
  { key: 'EV_CHARGER', label: '전기차 충전소' },
  { key: 'GAS_STATION', label: '주유소' },
  { key: 'TOILET', label: '화장실' },
  { key: 'PHARMACY', label: '약국' },
  { key: 'CONVENIENCE_STORE', label: '편의점' },
] as const;
export type FacilityType = (typeof FACILITY_TYPES)[number]['key'];

/** 반경(결정 Q-8 제안): 2km */
export const FACILITY_RADIUS_M = 2000;

/** S28 한 줄 */
export type FacilityRow = {
  id: string;
  number: number;
  name: string;
  /** "도보 5분". 모르면 null */
  walk: string | null;
  /** 확인된 상태 글자("급속 2대 사용 가능 · 10:15 확인"). 확인하지 못했으면 null */
  status: string | null;
  latitude: number;
  longitude: number;
};

/** GET /places/{placeId}/facilities?type&radiusMeters. 장애(오류)와 빈 결과를 나눈다 */
export async function getFacilities(placeId: string, type: FacilityType): Promise<Facility[]> {
  const { data } = await apiClient.get<PageResponse<Facility>>(
    `/places/${encodeURIComponent(placeId)}/facilities`,
    { params: { type, radiusMeters: FACILITY_RADIUS_M, limit: 20 } },
  );
  return data.data;
}

/** 기준 장소. GET /places/{placeId} */
export async function getBasePlace(
  placeId: string,
): Promise<{ id: string; name: string; latitude: number; longitude: number }> {
  const { data } = await apiClient.get<
    DataResponse<{ id: string; name: string; latitude: number; longitude: number }>
  >(`/places/${encodeURIComponent(placeId)}`);
  return data.data;
}

/** 머리의 여행 이름·동행 얼굴. GET /trips/{tripId} */
export async function getTripHead(tripId: string): Promise<{ title: string; members: string[] }> {
  const { data } = await apiClient.get<DataResponse<Trip>>(`/trips/${encodeURIComponent(tripId)}`);
  return {
    title: data.data.title,
    members: data.data.members.filter((m) => m.status === 'ACTIVE').map((m) => m.user.nickname),
  };
}

/** "06:00" 형식 */
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 같은 곳으로 볼 거리(m). 공공데이터에 같은 약국이 두 번(주소 표기만 다르게) 들어 있다 */
const SAME_PLACE_M = 30;

function metersBetween(a: Facility, b: Facility): number {
  const lat = ((a.latitude + b.latitude) / 2) * (Math.PI / 180);
  const dy = (a.latitude - b.latitude) * 111_320;
  const dx = (a.longitude - b.longitude) * 111_320 * Math.cos(lat);
  return Math.hypot(dx, dy);
}

/**
 * 이름이 같고 30m 안에 있는 시설은 하나만 남긴다(가까운 쪽).
 * 2026-11-16 공기계: 해운대 '더좋은약사와약국'·'해운메디약국'이 두 줄씩 나와 핀이 겹쳤다
 */
export function withoutDuplicates(items: readonly Facility[]): Facility[] {
  const kept: Facility[] = [];
  for (const f of items) {
    const name = f.name.replace(/\s+/g, '');
    const same = kept.some(
      (k) => k.name.replace(/\s+/g, '') === name && metersBetween(k, f) <= SAME_PLACE_M,
    );
    if (!same) kept.push(f);
  }
  return kept;
}

/** 서버 응답 → S28 줄. 가까운 순(걷는 시간), 모르면 뒤로. 같은 곳이 두 번 오면 하나만 */
export function toFacilityRows(items: readonly Facility[]): FacilityRow[] {
  return withoutDuplicates(
    [...items].sort((a, b) => (a.walkingSeconds ?? Infinity) - (b.walkingSeconds ?? Infinity)),
  ).map((f, i) => {
    const at = hhmm(f.queriedAt);
    return {
      id: f.providerId,
      number: i + 1,
      name: f.name,
      walk:
        f.walkingSeconds === null
          ? null
          : `도보 ${Math.max(1, Math.round(f.walkingSeconds / 60))}분`,
      status: f.availability ? `${f.availability}${at ? ` · ${at} 확인` : ''}` : null,
      latitude: f.latitude,
      longitude: f.longitude,
    };
  });
}
