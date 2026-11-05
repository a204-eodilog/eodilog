import type { Bookmark } from './types';

/** 목록·지도에 쓰는 즐겨찾기 한 곳. 원본이 사라진 즐겨찾기도 이름·위치는 남아 있다 */
export type SavedItem = {
  key: string;
  /** 원본이 사라졌으면 null(S14에서 이름·위치·메모만 보여 준다) */
  placeId: string | null;
  name: string;
  latitude: number;
  longitude: number;
  /** "부산" — 지도 지역 묶음 이름. 주소가 없으면 null */
  city: string | null;
  /** "부산 수영구" — 카드 둘째 줄. 주소가 없으면 null */
  area: string | null;
  /** 출처 배지. 응답에 출처 종류(SNS·블로그·캡처)가 없어 공동 피드에서 담은 것만 표시 */
  source: string | null;
};

const METRO = /(특별시|광역시|특별자치시)$/;
const PROVINCE = /(특별자치도|도)$/;
const CITY_SUFFIX = /(시|군)$/;

/**
 * 주소의 앞 두 단계를 짧게. "부산광역시 수영구 광안해변로" → ["부산", "수영구"],
 * "강원특별자치도 강릉시 강문동" → ["강릉", "강문동"], "제주특별자치도 제주시 애월읍" → ["제주", "애월읍"].
 * 시·도 이름만 있으면 [그 이름]
 */
export function addressParts(address: string | null): string[] {
  const tokens = (address ?? '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const [first, second, third] = tokens;
  if (METRO.test(first)) return [first.replace(METRO, ''), second].filter(Boolean) as string[];
  if (PROVINCE.test(first) && second) {
    return [second.replace(CITY_SUFFIX, ''), third].filter(Boolean) as string[];
  }
  return [first.replace(CITY_SUFFIX, ''), second].filter(Boolean) as string[];
}

export function toSavedItem(bookmark: Bookmark): SavedItem {
  const { place, retainedPlace } = bookmark;
  const parts = addressParts(place?.address ?? null);
  return {
    key: place?.id ?? `retained-${bookmark.createdAt}-${retainedPlace.name}`,
    placeId: place?.id ?? null,
    name: place?.name ?? retainedPlace.name,
    latitude: place?.latitude ?? retainedPlace.latitude,
    longitude: place?.longitude ?? retainedPlace.longitude,
    city: parts[0] ?? null,
    area: parts.length > 0 ? parts.join(' ') : null,
    source: bookmark.sourceFeedId ? '공동 피드' : null,
  };
}

/**
 * 엇갈린 2열 목록. 사진 높이는 피그마처럼 160~220에서 돌아가며 정하고(사진 API가 없어 자리만 그린다),
 * 지금까지 더 짧은 열에 다음 카드를 넣는다. 서버 순서(최근 저장한 순)는 위에서 아래로 유지된다
 */
const PHOTO_HEIGHTS = [200, 160, 220, 180, 190] as const;

export type MasonryCard = { item: SavedItem; photoHeight: number };

export function masonryColumns(items: SavedItem[]): [MasonryCard[], MasonryCard[]] {
  const columns: [MasonryCard[], MasonryCard[]] = [[], []];
  const heights = [0, 0];
  items.forEach((item, i) => {
    const photoHeight = PHOTO_HEIGHTS[i % PHOTO_HEIGHTS.length];
    const col = heights[0] <= heights[1] ? 0 : 1;
    columns[col].push({ item, photoHeight });
    heights[col] += photoHeight;
  });
  return columns;
}

/** 지도 지역 묶음 마커. 위치는 그 지역 장소들의 가운데 */
export type CityGroup = {
  city: string;
  latitude: number;
  longitude: number;
  items: SavedItem[];
};

/** 주소가 없는 곳은 "기타"로 묶는다. 많은 지역부터 */
export function cityGroups(items: SavedItem[]): CityGroup[] {
  const groups = new Map<string, SavedItem[]>();
  for (const item of items) {
    const city = item.city ?? '기타';
    groups.set(city, [...(groups.get(city) ?? []), item]);
  }
  return [...groups.entries()]
    .map(([city, list]) => ({
      city,
      latitude: list.reduce((s, i) => s + i.latitude, 0) / list.length,
      longitude: list.reduce((s, i) => s + i.longitude, 0) / list.length,
      items: list,
    }))
    .sort((a, b) => b.items.length - a.items.length);
}

/** 연결 끊김 안내 둘째 줄. 마지막으로 받아 온 시각(기기 시간) "10:20 기준이에요" */
export function syncedAtLabel(updatedAt: number): string {
  const d = new Date(updatedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} 기준이에요`;
}

/** 지도 범위(라이브러리 Region 규칙: 위도·경도는 남서쪽 꼭짓점, delta만큼 북동쪽으로 넓어진다) */
export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

/** 장소가 한 곳뿐이어도 너무 확대되지 않게 잡는 최소 범위(동네 몇 개 정도) */
const MIN_SPAN = 0.02;

/**
 * 지역 묶음 마커를 눌렀을 때 그 지역 장소가 모두 보이는 범위. 둘레에 여유를 두고,
 * 아래쪽은 화면 아래 가로 카드가 가리므로 더 넓게 둬 핀이 카드 위에 오게 한다
 */
export function regionFor(items: SavedItem[]): MapRegion | null {
  if (items.length === 0) return null;
  const lats = items.map((i) => i.latitude);
  const lngs = items.map((i) => i.longitude);
  const minLat = Math.min(...lats);
  const minLng = Math.min(...lngs);
  const latSpan = Math.max(Math.max(...lats) - minLat, MIN_SPAN);
  const lngSpan = Math.max(Math.max(...lngs) - minLng, MIN_SPAN);
  return {
    latitude: minLat - latSpan * 0.8,
    longitude: minLng - lngSpan * 0.3,
    latitudeDelta: latSpan * 2.1,
    longitudeDelta: lngSpan * 1.6,
  };
}
