import { isAxiosError } from 'axios';

/** 검색어 최대 길이. 명세에 없어 화면에서 정했다 */
export const QUERY_MAX_LENGTH = 100;
/** 서버 places.name varchar(255) */
export const PLACE_NAME_MAX_LENGTH = 255;

/** 보낼 검색어. 앞뒤·겹친 공백을 정리하고 비었으면 null */
export function normalizeQuery(input: string): string | null {
  const q = input.trim().replace(/\s+/g, ' ').slice(0, QUERY_MAX_LENGTH);
  return q || null;
}

/** 지도에서 고른 장소 이름. 비었거나 너무 길면 null */
export function normalizePlaceName(input: string): string | null {
  const name = input.trim().replace(/\s+/g, ' ');
  if (!name || name.length > PLACE_NAME_MAX_LENGTH) return null;
  return name;
}

/**
 * 검색 실패 종류.
 * slow: 시간 초과(axios ECONNABORTED)나 공급자 장애(503 PROVIDER_UNAVAILABLE) → "검색이 오래 걸려 멈췄어요" + [다시 검색]
 * error: 그 밖의 실패 → 공통 오류 화면
 * 사용자가 검색어를 바꿔 이전 요청을 취소한 것은 실패로 보지 않는다(canceled)
 */
export function searchFailure(error: unknown): 'slow' | 'error' | 'canceled' {
  if (!isAxiosError(error)) return 'error';
  if (error.code === 'ERR_CANCELED') return 'canceled';
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return 'slow';
  if (error.response?.status === 503) return 'slow';
  return 'error';
}

/** 좌표 한 줄 표시. "35.1532, 129.1186" */
export function formatCoord(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

type LatLngLike = { latitude: number; longitude: number };

/** 두 점 사이 거리(m). 지구를 공으로 본 대략값이라 검색 결과 정렬·표시에만 쓴다 */
export function distanceMeters(a: LatLngLike, b: LatLngLike): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "300m" / "1.2km" / "12km" */
export function distanceLabel(meters: number): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)}m`;
  if (meters < 10_000) return `${(meters / 1000).toFixed(1)}km`;
  return `${Math.round(meters / 1000)}km`;
}

const SIDO_SHORT: Record<string, string> = {
  서울특별시: '서울',
  부산광역시: '부산',
  대구광역시: '대구',
  인천광역시: '인천',
  광주광역시: '광주',
  대전광역시: '대전',
  울산광역시: '울산',
  세종특별자치시: '세종',
  경기도: '경기',
  강원특별자치도: '강원',
  강원도: '강원',
  충청북도: '충북',
  충청남도: '충남',
  전북특별자치도: '전북',
  전라북도: '전북',
  전라남도: '전남',
  경상북도: '경북',
  경상남도: '경남',
  제주특별자치도: '제주',
};

/** 같은 이름끼리 구분할 짧은 주소. "부산광역시 수영구 광안해변로 219" → "부산 수영구 광안해변로" */
export function shortAddress(address: string | null): string | null {
  if (!address) return null;
  const parts = address.trim().split(/\s+/);
  if (parts.length === 0) return null;
  parts[0] = SIDO_SHORT[parts[0]] ?? parts[0];
  return parts.slice(0, 3).join(' ');
}

/**
 * 검색 결과 순서: 이름이 검색어와 똑같은 곳 먼저, 그다음 기준점(지도 가운데)에서 가까운 순.
 * 서버가 가까운 순(near)을 아직 주지 않아 받은 결과 안에서만 다시 줄 세운다
 */
export function rankNear<P extends LatLngLike & { name: string }>(
  places: readonly P[],
  query: string,
  center: LatLngLike,
): { place: P; meters: number }[] {
  const q = query.trim();
  return places
    .map((place) => ({ place, meters: distanceMeters(center, place) }))
    .sort((a, b) => {
      const ea = a.place.name === q ? 0 : 1;
      const eb = b.place.name === q ? 0 : 1;
      return ea - eb || a.meters - b.meters;
    });
}
