import type { CandidateOption, PollCandidate, PollType, SavedPlace } from './types';

/** 이름을 아직 받지 못한 지역·장소 */
export const UNKNOWN_NAME = '알 수 없는 곳';

/** 그룹 즐겨찾기 장소들이 속한 지역 ID와 장소 수. 장소 수 많은 순, 같으면 처음 나온 순 */
export function regionCounts(saved: SavedPlace[]): { regionId: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of saved) {
    const id = s.place.regionId;
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([regionId, count]) => ({ regionId, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * N8·후보 추가 시트의 후보 줄(research R5).
 * 장소 투표는 그룹 즐겨찾기 장소(최근 담은 순), 지역 투표는 그 장소들이 속한 지역과 장소 수.
 * 이미 투표 후보인 곳은 뺀다
 */
export function buildCandidateOptions(
  type: PollType,
  saved: SavedPlace[],
  existing: PollCandidate[],
  regionNames: Record<string, string>,
  /** 여행 동행 ID → 닉네임. 장소를 담은 동행 이름에 쓴다 */
  memberNames: Record<string, string> = {},
): CandidateOption[] {
  if (type === 'PLACE') {
    const taken = new Set(existing.map((c) => c.placeId).filter(Boolean));
    return saved
      .filter((s) => !taken.has(s.place.id))
      .map((s) => ({
        key: s.place.id,
        title: s.place.name,
        subtitle: s.place.address,
        input: { placeId: s.place.id },
        savedCount: s.savedCount,
        savers: s.savedBy.flatMap((b) =>
          memberNames[b.memberId] ? [memberNames[b.memberId]] : [],
        ),
      }));
  }
  const taken = new Set(existing.map((c) => c.regionId).filter(Boolean));
  return regionCounts(saved)
    .filter((r) => !taken.has(r.regionId))
    .map((r) => ({
      key: r.regionId,
      title: regionNames[r.regionId] ?? UNKNOWN_NAME,
      subtitle: `그룹 즐겨찾기 ${r.count}곳`,
      input: { regionId: r.regionId },
    }));
}

/**
 * 지역 후보 줄 앞에 그룹 즐겨찾기에 없는 지역을 더한다. 추천 결과의 여행지를 투표 후보로 넘길 때 쓴다.
 * 이미 후보 줄에 있는 지역은 더하지 않는다
 */
export function withExtraRegions(
  options: CandidateOption[],
  extra: { id: string; name: string }[],
): CandidateOption[] {
  const have = new Set(options.map((o) => o.key));
  const added = extra
    .filter((r) => !have.has(r.id))
    .map((r) => ({ key: r.id, title: r.name, subtitle: '추천 여행지', input: { regionId: r.id } }));
  return [...added, ...options];
}
