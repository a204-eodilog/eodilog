import { create } from 'zustand';

import type { CreateTripBody, DateRange, Region } from '../types';

type NewTripDraft = {
  title: string;
  range: DateRange | null;
  regions: Region[];
  setTitle: (title: string) => void;
  setRange: (range: DateRange | null) => void;
  /** 같은 지역은 한 번만 들어간다 */
  addRegion: (region: Region) => void;
  removeRegion: (regionId: string) => void;
  reset: () => void;
};

/**
 * 새 여행(S16) 입력 중 상태. S16과 여행지 검색 화면이 함께 쓴다.
 * 만들기에 성공하거나 닫을 때 비운다. 실패하면 그대로 두어 다시 입력하지 않게 한다.
 */
export const useNewTripDraft = create<NewTripDraft>((set) => ({
  title: '',
  range: null,
  regions: [],
  setTitle: (title) => set({ title }),
  setRange: (range) => set({ range }),
  addRegion: (region) =>
    set((s) =>
      s.regions.some((r) => r.id === region.id) ? s : { regions: [...s.regions, region] },
    ),
  removeRegion: (regionId) => set((s) => ({ regions: s.regions.filter((r) => r.id !== regionId) })),
  reset: () => set({ title: '', range: null, regions: [] }),
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
