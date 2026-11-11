import { router } from 'expo-router';

/**
 * 투표 결과 화면의 버튼이 가는 곳(contracts/routes.md).
 */
export const pollRoutes = {
  /** 동률 [코스에서 날짜별로 나누기] → S23 코스 짜기의 여러 지역 날짜별로 나누기 */
  splitByDay(tripId: string) {
    router.push(`/trips/${tripId}/course/edit?split=1`);
  },
  /** 여행지 확정 [장소 모으고 코스 짜기] → S20 그룹 즐겨찾기 */
  collectPlaces(tripId: string) {
    router.push(`/trips/${tripId}/favorites`);
  },
  /** 0표 [직접 정하기] → 여행지 고르기 */
  decideDirectly(tripId: string) {
    router.push(`/trips/${tripId}/settings-region`);
  },
};
