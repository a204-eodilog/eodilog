import { router } from 'expo-router';

import { toast } from '@/components/ui';

/**
 * 투표 결과 화면의 버튼이 가는 곳(contracts/routes.md).
 * 코스 짜기(6번)·그룹 즐겨찾기(7번) 화면이 생기기 전에는 '준비 중이에요'를 띄운다 (가정 — 사용자 확인 필요, Q-4-4).
 * 그 명세에서 이 파일의 함수만 실제 화면으로 바꾼다
 */
export const pollRoutes = {
  /** 동률 [코스에서 날짜별로 나누기] → S23 여러 지역 날짜별로 나누기(6번에서 연결) */
  splitByDay(_tripId: string) {
    toast.show('준비 중이에요');
  },
  /** 여행지 확정 [장소 모으고 코스 짜기] → S20 그룹 즐겨찾기(7번에서 연결) */
  collectPlaces(_tripId: string) {
    toast.show('준비 중이에요');
  },
  /** 0표 [직접 정하기] → 여행지 고르기 */
  decideDirectly(tripId: string) {
    router.push(`/trips/${tripId}/settings-region`);
  },
};
