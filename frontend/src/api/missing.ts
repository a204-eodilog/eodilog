import { toApiError } from './errors';

/**
 * 서버에 아직 없는 API(경로 없음: 404 + 공통 코드 NOT_FOUND)는 빈 값으로 본다.
 * 자료가 없을 때의 404는 TRIP_NOT_FOUND처럼 자기 코드가 와서 여기에 걸리지 않는다.
 * 백엔드가 그 API를 만들면 이 함수는 아무 일도 하지 않는다
 */
export async function emptyIfMissing<T>(request: Promise<T>, empty: T): Promise<T> {
  try {
    return await request;
  } catch (e) {
    const error = toApiError(e);
    if (error.status === 404 && error.code === 'NOT_FOUND') return empty;
    throw e;
  }
}
