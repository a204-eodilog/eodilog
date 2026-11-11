import { EmptyState } from '@/components/ui';
import { openOverTabs } from '@/lib/open-over-tabs';

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
      // replace는 탭 묶음을 하나 더 만들어 뒤로 가기에 같은 탭 화면이 또 나온다. 있는 탭 화면의 여행 탭으로 돌아간다
      onAction={() => openOverTabs('/trips')}
    />
  );
}
