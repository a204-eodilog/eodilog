/**
 * 내 여행 기능에서 다른 기능이 쓰는 것만 내보낸다(S14 그룹 즐겨찾기에 추가 시트의 여행 목록).
 * 다른 기능 폴더는 이 파일로만 불러온다(CONVENTION "다른 기능 폴더의 내부 파일을 직접 불러오지 않는다")
 */
export { getAllMyTrips } from './api';
export { companionNames, formatPeriod } from './my-trip-rules';
export type { MyTrip } from './types';
