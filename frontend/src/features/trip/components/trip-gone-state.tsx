import { router } from 'expo-router';

import { EmptyState } from '@/components/ui';

/**
 * 참여하지 않았거나 나간·내보내진·삭제된 여행(서버는 모두 404 TRIP_NOT_FOUND로 답한다, 백엔드 P-10).
 * 여행 상세(S17)·초대(S18)·설정(S19)이 같은 안내를 쓴다(동행 명세 FR-031)
 */
export function TripGoneState() {
  return (
    <EmptyState
      icon="alert"
      title="볼 수 없는 여행이에요"
      description="참여하지 않았거나 이미 나간 여행이에요"
      actionLabel="여행 목록으로"
      onAction={() => router.replace('/trips')}
    />
  );
}
