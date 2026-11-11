import { openOverTabs } from '@/lib/open-over-tabs';

import { tripHref } from './invite-rules';

/** 초대로 참여한 여행(S17)을 탭 화면 위에 연다. 초대 확인(S04)과 첫 가입 취향 입력(S03) 뒤에 부른다 */
export function openJoinedTrip(tripId: string) {
  openOverTabs(tripHref(tripId));
}
