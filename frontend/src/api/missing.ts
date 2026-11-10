import { toApiError } from './errors';

/**
 * 서버에 아직 없는 API(경로 없음: 404 + 공통 코드 NOT_FOUND)는 빈 값으로 본다.
 * 백엔드가 그 API를 만들면 이 함수는 아무 일도 하지 않는다.
 *
 * 주의: 서버는 경로가 없을 때뿐 아니라 일부 자료가 없을 때도 같은 NOT_FOUND를 준다
 * (장소·개인 저장·여행별 저장·초대). 그래서 경로에 자료 ID가 들어가는 API
 * (`/places/{placeId}/…` 편의시설·방문자 요약 등)에는 쓰지 않는다. 없는 장소가 빈 값으로 보인다.
 * "내 것 목록"처럼 자료가 없다고 404가 날 수 없는 API에만 쓴다.
 * 앱 쪽 경로가 틀려도 빈 화면이 되므로, 서버에 API가 생기면 실제 응답이 오는지 한 번 확인한다
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
