/**
 * 방문 기능에서 다른 기능이 쓰는 것만 내보낸다(S38 내 여행 기록의 코스·평가 요약).
 * 다른 기능 폴더는 이 파일로만 불러온다(CONVENTION "다른 기능 폴더의 내부 파일을 직접 불러오지 않는다")
 */
export { getMyVisits } from './api';
export { itineraryItemsQuery, visitKeys } from './hooks/use-visit-board';
export type { ItineraryItem, Visit } from './types';
