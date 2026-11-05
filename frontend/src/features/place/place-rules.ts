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
