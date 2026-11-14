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
  /** 카드 사진 주소. 서버가 아직 주지 않아 진짜 서버에서는 null이다 */
  imageUrl: string | null;
  /** 내 메모. 목록 카드에 한 줄로 보인다. 없으면 null */
  memo: string | null;
  /** 지도 공급자의 분류 글. 서버가 주지 않으면 null이고, 종류는 이름으로 짐작한다 */
  category: string | null;
  /** 공급자. 사진 출처 표시에 쓴다('KTO'면 한국관광공사) */
  provider: string | null;
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

/**
 * 즐겨찾기를 가리키는 값(S10 → S14 경로). 보통은 장소 id, 원본이 사라져 장소가 없으면 저장 시각과 이름.
 * 즐겨찾기 하나를 읽는 API가 없어 S14는 목록에서 이 값으로 찾는다
 */
export function bookmarkKey(bookmark: Bookmark): string {
  return bookmark.place?.id ?? `retained-${bookmark.createdAt}-${bookmark.retainedPlace.name}`;
}

export function findBookmark(bookmarks: Bookmark[], key: string): Bookmark | null {
  return bookmarks.find((b) => bookmarkKey(b) === key) ?? null;
}

/**
 * S14 "가져온 곳". feed: 공동 피드에서 담음(누르면 S07) / lost: 원본 피드가 지워졌거나 볼 수 없음
 * / none: 링크·캡처처럼 피드가 아닌 곳에서 담음(줄을 그리지 않는다)
 */
export function bookmarkSource(bookmark: Bookmark): 'feed' | 'lost' | 'none' {
  if (bookmark.sourceUnavailable) return 'lost';
  return bookmark.sourceFeedId ? 'feed' : 'none';
}

export function toSavedItem(bookmark: Bookmark): SavedItem {
  const { place, retainedPlace } = bookmark;
  const parts = addressParts(place?.address ?? null);
  return {
    key: bookmarkKey(bookmark),
    placeId: place?.id ?? null,
    name: place?.name ?? retainedPlace.name,
    latitude: place?.latitude ?? retainedPlace.latitude,
    longitude: place?.longitude ?? retainedPlace.longitude,
    city: parts[0] ?? null,
    area: parts.length > 0 ? parts.join(' ') : null,
    source: bookmark.sourceFeedId ? '공동 피드' : null,
    imageUrl: place?.imageUrl ?? null,
    memo: bookmark.memo?.trim() || null,
    category: place?.category ?? null,
    provider: place?.provider ?? null,
  };
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

/**
 * 카드를 넘겼을 때 그 장소 하나를 확대해 보이는 범위. 장소는 가로 가운데에 오고,
 * 세로는 가운데보다 조금 아래에 와서 화면 아래 카드 바로 위에 핀이 보인다(regionFor에 한 곳을 넣었을 때와 같은 높이)
 */
export function regionForPlace(item: SavedItem): MapRegion {
  return {
    latitude: item.latitude - MIN_SPAN * 0.8,
    longitude: item.longitude - MIN_SPAN * 0.8,
    latitudeDelta: MIN_SPAN * 2.1,
    longitudeDelta: MIN_SPAN * 1.6,
  };
}

/** S08 저장 위치 선택. 나만 보기 / 동행과 같이 / 둘 다(2026-11-14 사용자 결정: 두 곳에 한 번에 저장) */
export type SaveChoice = 'personal' | 'trip' | 'both';

/** 이 저장 위치에 나만 보기(개인 즐겨찾기)가 들어 있는지 */
export function savesPersonal(choice: SaveChoice): boolean {
  return choice !== 'trip';
}

/** 이 저장 위치에 동행과 같이(여행의 그룹 즐겨찾기)가 들어 있는지 */
export function savesTrip(choice: SaveChoice): boolean {
  return choice !== 'personal';
}

/**
 * 칸을 눌렀을 때의 다음 저장 위치. 꺼진 칸을 누르면 켜져 둘 다가 되고, 켜진 칸을 누르면 꺼진다.
 * 하나는 늘 켜져 있어야 해서, 하나만 켜진 칸을 누르면 그대로 둔다
 */
export function toggleSaveChoice(choice: SaveChoice, cell: 'personal' | 'trip'): SaveChoice {
  if (choice === 'both') return cell === 'personal' ? 'trip' : 'personal';
  return choice === cell ? choice : 'both';
}

/**
 * S08 장소 저장 시트에서 실제 저장 위치와 [저장]을 누를 수 있는지.
 * 내 여행을 불러왔는데 하나도 없으면 동행과 같이를 막고 나만 보기로 저장한다(결정 F-10).
 * 동행과 같이는 내 여행을 불러왔고 여행을 하나 골랐을 때만 저장할 수 있다
 */
export function placeSaveState(input: {
  choice: SaveChoice;
  tripsStatus: 'loading' | 'error' | 'ready';
  tripCount: number;
  selectedTripId: string | null;
}): { target: SaveChoice; tripDisabled: boolean; canSave: boolean } {
  const tripDisabled = input.tripsStatus === 'ready' && input.tripCount === 0;
  const target = tripDisabled ? 'personal' : input.choice;
  // 여행에도 담는다면(동행과 같이·둘 다) 내 여행을 불러왔고 하나를 골랐어야 한다
  const canSave =
    target === 'personal' || (input.tripsStatus === 'ready' && input.selectedTripId !== null);
  return { target, tripDisabled, canSave };
}

/** S08 저장 완료 토스트 문구. 여행이면 "강릉 바다에 담았어요"(S14 그룹에 추가와 같은 문구) */
export function placeSavedMessage(tripTitle: string | null, alsoPersonal = false): string {
  if (!tripTitle) return '개인 즐겨찾기에 저장했어요';
  return alsoPersonal ? `개인 즐겨찾기와 ${tripTitle}에 담았어요` : `${tripTitle}에 담았어요`;
}

/** 개인 저장 탭(S10 목록·지도)의 주소 */
export const SAVED_TAB_PATH = '/saved';

/**
 * 개인 즐겨찾기 저장 완료 안내에 [보기](→ S10)를 붙일지.
 * 지금 S10을 보고 있거나, 저장한 뒤 부르는 쪽이 S10으로 데려가면(S12) 볼 곳이 이미 눈앞이라 붙이지 않는다
 */
export function showSavedLink(pathname: string, opensSavedTab: boolean): boolean {
  return !opensSavedTab && pathname !== SAVED_TAB_PATH;
}
