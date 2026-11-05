import { create, type StoreApi } from 'zustand';

import type { CreateTripBody, DateRange, Region } from '../types';

/** 이름·기간·여행지 입력 칸. 새 여행(S16)과 여행 설정(S19)이 함께 쓴다 */
export type TripDraftFields = {
  title: string;
  range: DateRange | null;
  regions: Region[];
  setTitle: (title: string) => void;
  setRange: (range: DateRange | null) => void;
  /** 같은 지역은 한 번만 들어간다 */
  addRegion: (region: Region) => void;
  removeRegion: (regionId: string) => void;
};

export const EMPTY_DRAFT = { title: '', range: null, regions: [] as Region[] };

/** 두 스토어가 함께 쓰는 입력 칸과 설정 함수. 스토어마다 reset 등은 따로 더한다 */
export function tripDraftFields<T extends TripDraftFields>(
  set: StoreApi<T>['setState'],
): TripDraftFields {
  return {
    ...EMPTY_DRAFT,
    setTitle: (title) => set({ title } as Partial<T>),
    setRange: (range) => set({ range } as Partial<T>),
    addRegion: (region) =>
      set((s) =>
        s.regions.some((r) => r.id === region.id)
          ? s
          : ({ regions: [...s.regions, region] } as Partial<T>),
      ),
    removeRegion: (regionId) =>
      set((s) => ({ regions: s.regions.filter((r) => r.id !== regionId) }) as Partial<T>),
  };
}

type NewTripDraft = TripDraftFields & { reset: () => void };

/**
 * 새 여행(S16) 입력 중 상태. S16과 여행지 검색 화면이 함께 쓴다.
 * 만들기에 성공하거나 새 여행 화면이 닫힐 때(뒤로 가기 포함) 비운다.
 * 실패하면 그대로 두어 다시 입력하지 않게 한다.
 */
export const useNewTripDraft = create<NewTripDraft>((set) => ({
  ...tripDraftFields<NewTripDraft>(set),
  reset: () => set(EMPTY_DRAFT),
}));

/** 서버로 보낼 본문. 정하지 않은 값은 아예 빼고 보낸다 */
export function toCreateBody(
  draft: Pick<NewTripDraft, 'title' | 'range' | 'regions'>,
): CreateTripBody {
  return {
    title: draft.title.trim(),
    ...(draft.range ? { startDate: draft.range.start, endDate: draft.range.end } : {}),
    ...(draft.regions.length > 0 ? { destinationRegionIds: draft.regions.map((r) => r.id) } : {}),
  };
}
