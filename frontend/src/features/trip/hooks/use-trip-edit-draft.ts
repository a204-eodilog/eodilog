import { useEffect } from 'react';
import { create } from 'zustand';

import type { Region, Trip } from '../types';

import { EMPTY_DRAFT, tripDraftFields, type TripDraftFields } from './use-new-trip-draft';

type TripEditDraft = TripDraftFields & {
  /**
   * 채울 때의 여행 전체. 저장할 때 비교 기준이자 expectedVersion이다(research R6).
   * 수정 중 여행을 새로 받아도 바꾸지 않아야 다른 동행의 변경을 덮어쓰지 않는다
   */
  base: Trip | null;
  /** 부르면 언제나 덮어쓴다. S19를 처음 열 때만 부른다. 409 뒤에는 useUpdateTrip이 칸마다 골라 다시 채운다 */
  fill: (trip: Trip, regions: Region[]) => void;
  /**
   * 버전만 오른 여행으로 기준을 옮긴다. 입력값은 그대로 둔다. 내가 한 방장 넘기기·동행 내보내기 뒤와,
   * S19를 연 동안 여행을 새로 받았을 때(동행이 들어오거나 나가도 서버는 버전을 올린다) 부른다.
   * 그러지 않으면 이름·기간을 아무도 안 고쳤는데도 다음 [완료]가 409를 받고 입력이 최신 값으로 덮인다.
   * 이름·기간·여행지가 기준과 다르면(그 사이 다른 동행이 고쳤으면) 옮기지 않는다. 옮기면 그 변경을 덮어쓰게 되므로
   * 저장할 때 409로 알게 둔다. 기준보다 오래된 여행으로는 옮기지 않는다
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
      s.base &&
      s.base.id === trip.id &&
      trip.version > s.base.version &&
      sameEditableFields(s.base, trip)
        ? { base: trip }
        : s,
    ),
  reset: () => set({ ...EMPTY_DRAFT, base: null }),
}));

/**
 * S19가 열린 동안 입력값을 여행과 맞춘다(research R6).
 * 처음 한 번만 채우고, 그 뒤 여행을 새로 받으면 rebase로 기준만 옮긴다(버전만 올랐을 때). 고치던 값은 그대로다
 */
export function useSyncEditDraft(
  tripId: string,
  trip: Trip | undefined,
  regions: Region[],
  regionsReady: boolean,
) {
  const filledFor = useTripEditDraft((s) => s.base?.id);
  const fill = useTripEditDraft((s) => s.fill);
  const rebase = useTripEditDraft((s) => s.rebase);
  useEffect(() => {
    if (!trip || !regionsReady) return;
    if (filledFor !== tripId) fill(trip, regions);
    else rebase(trip);
  }, [trip, regionsReady, regions, filledFor, tripId, fill, rebase]);
}
