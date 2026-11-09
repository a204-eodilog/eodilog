import type { CoursePlace, PhotoSummary, PhotoTopic, TripPhoto } from './types';

/** 주제 칩 순서와 이름(값 문서 S31: 전체 / 풍경 / 음식 / 사람 / 기타) */
export const TOPICS: { key: PhotoTopic; label: string }[] = [
  { key: 'LANDSCAPE', label: '풍경' },
  { key: 'FOOD', label: '음식' },
  { key: 'PEOPLE', label: '사람' },
  { key: 'OTHER', label: '기타' },
];

export type TopicFilter = PhotoTopic | 'ALL';

/** 주제 칩. 수는 전체 집계(목록 필터와 상관없음)에서 */
export function topicChips(
  summary: PhotoSummary,
): { key: TopicFilter; label: string; count: number }[] {
  const byTopic = new Map(summary.topics.map((t) => [t.topic, t.count]));
  return [
    { key: 'ALL', label: '전체', count: summary.totalCount },
    ...TOPICS.map((t) => ({ ...t, count: byTopic.get(t.key) ?? 0 })),
  ];
}

export function filterByTopic(photos: readonly TripPhoto[], topic: TopicFilter): TripPhoto[] {
  return topic === 'ALL' ? [...photos] : photos.filter((p) => p.topics.includes(topic));
}

/** 장소별 묶음 한 칸 */
export type PlaceSection = {
  placeId: string;
  /** 모르면 null(이름을 아직 못 읽음) */
  name: string | null;
  /** 코스 일차. 코스에 없는 장소면 null */
  day: number | null;
  photos: TripPhoto[];
};

/**
 * 장소가 있는 사진을 장소별로 묶는다. 코스 장소는 코스 순서(일차·순서)대로, 코스에 없는 장소는 그 뒤에
 * 최근에 올린 순으로. 묶음 안 사진은 받은 순서(최근에 올린 순) 그대로
 */
export function groupByPlace(
  photos: readonly TripPhoto[],
  course: readonly CoursePlace[],
  names: Readonly<Record<string, string>>,
): PlaceSection[] {
  const sections = new Map<string, PlaceSection>();
  for (const photo of photos) {
    if (!photo.placeId) continue;
    const section = sections.get(photo.placeId);
    if (section) section.photos.push(photo);
    else {
      const stop = course.find((c) => c.place.id === photo.placeId);
      sections.set(photo.placeId, {
        placeId: photo.placeId,
        name: stop?.place.name ?? names[photo.placeId] ?? null,
        day: stop?.day ?? null,
        photos: [photo],
      });
    }
  }
  // 코스에 없는 장소는 같은 값이라 정렬이 처음 나온 순서(최근에 올린 순)를 지킨다
  const coursePos = (s: PlaceSection) => {
    const stop = course.find((c) => c.place.id === s.placeId);
    return stop ? stop.day * 1000 + stop.order : Number.MAX_SAFE_INTEGER;
  };
  return [...sections.values()].sort((a, b) => coursePos(a) - coursePos(b));
}

/** 묶음 제목 오른쪽 "1일차 · 9장"(코스에 없으면 "9장") */
export function sectionMeta(section: PlaceSection): string {
  const count = `${section.photos.length}장`;
  return section.day ? `${section.day}일차 · ${count}` : count;
}

/** 코스 장소를 일차별로(장소 미지정 묶음의 "어디서 찍었나요?"). 같은 장소가 여러 번 나오면 처음만 */
export function courseDays(
  course: readonly CoursePlace[],
  startDate: string | null,
): { day: number; label: string; stops: CoursePlace[] }[] {
  const seen = new Set<string>();
  const days = new Map<number, CoursePlace[]>();
  for (const stop of [...course].sort((a, b) => a.day - b.day || a.order - b.order)) {
    if (seen.has(stop.place.id)) continue;
    seen.add(stop.place.id);
    days.set(stop.day, [...(days.get(stop.day) ?? []), stop]);
  }
  return [...days.entries()].map(([day, stops]) => ({
    day,
    label: dayLabel(day, startDate),
    stops,
  }));
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** "1일차 · 11.14(토)". 시작일을 모르면 "1일차" */
export function dayLabel(day: number, startDate: string | null): string {
  const m = startDate ? /^(\d{4})-(\d{2})-(\d{2})/.exec(startDate) : null;
  if (!m) return `${day}일차`;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + day - 1);
  return `${day}일차 · ${d.getMonth() + 1}.${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

/** 아래 줄 "사진 32장 · 3명이 올렸어요" */
export function uploadSummaryText(photos: readonly TripPhoto[]): string {
  const uploaders = new Set(photos.map((p) => p.uploaderMemberId)).size;
  return `사진 ${photos.length}장 · ${uploaders}명이 올렸어요`;
}

/** 사진 이미지 경로(로그인해야 받는 다운로드). lib/asset-image의 assetSource에 넘긴다 */
export function photoPath(assetId: string): string {
  return `/api/v1/assets/${encodeURIComponent(assetId)}/download`;
}
