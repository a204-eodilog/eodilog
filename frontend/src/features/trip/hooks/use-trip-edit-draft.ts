import { create } from 'zustand';

import type { Region, Trip } from '../types';

import { EMPTY_DRAFT, tripDraftFields, type TripDraftFields } from './use-new-trip-draft';

type TripEditDraft = TripDraftFields & {
  /**
   * 채울 때의 여행 전체. 저장할 때 비교 기준이자 expectedVersion이다(research R6).
   * 수정 중 여행을 새로 받아도 바꾸지 않아야 다른 동행의 변경을 덮어쓰지 않는다
   */
  base: Trip | null;
  /** 부르면 언제나 덮어쓴다. S19를 처음 열 때와 409 뒤에만 부른다 */
  fill: (trip: Trip, regions: Region[]) => void;
  /**
   * 내가 한 방장 넘기기·동행 내보내기가 성공해 버전만 오른 여행으로 기준을 옮긴다. 입력값은 그대로 둔다.
   * 그러지 않으면 다음 [완료]가 내 변경 때문에 409를 받는다.
   * 이름·기간·여행지가 기준과 다르면(그 사이 다른 동행이 고쳤으면) 옮기지 않는다. 옮기면 그 변경을 덮어쓰게 되므로
   * 저장할 때 409로 알게 둔다
   */
  rebase: (trip: Trip) => void;
  reset: () => void;
};

function sameEditableFields(a: Trip, b: Trip): boolean {
  return (
    a.title === b.title &&
    a.startDate === b.startDate &&
    a.endDate === b.endDate &&
    a.destinationRegionIds.length === b.destinationRegionIds.length &&
    a.destinationRegionIds.every((id, i) => id === b.destinationRegionIds[i])
  );
}

/** S19 여행 설정에서 [완료]를 누르기 전의 입력값. S19와 설정용 여행지 검색 화면이 함께 쓴다 */
export const useTripEditDraft = create<TripEditDraft>((set) => ({
  ...tripDraftFields<TripEditDraft>(set),
  base: null,
  fill: (trip, regions) =>
    set({
      base: trip,
      title: trip.title,
      range: trip.startDate && trip.endDate ? { start: trip.startDate, end: trip.endDate } : null,
      regions,
    }),
  rebase: (trip) =>
    set((s) =>
      s.base && s.base.id === trip.id && sameEditableFields(s.base, trip) ? { base: trip } : s,
    ),
  reset: () => set({ ...EMPTY_DRAFT, base: null }),
}));
