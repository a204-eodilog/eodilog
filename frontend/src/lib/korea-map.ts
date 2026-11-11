import data from '@/assets/map/korea-regions.json';

/**
 * 시도·시군구 SVG 경계 (frontend/scripts/korea-map/README.md).
 * code는 우리 regions.code(법정동 10자리)와 같다. 세종은 시도이면서 시군구 한 칸이다.
 */
export type MapPoint = readonly [number, number];

export type MapRegion = {
  code: string;
  name: string;
  /** SVG path */
  d: string;
  /** 지역 안쪽 점. 핀·이름표 자리 */
  point: MapPoint;
};

export type MapSigungu = MapRegion & { parent: string };

type KoreaRegions = {
  source: string;
  projection: { lat0: number; minX: number; minY: number; scale: number };
  width: number;
  height: number;
  sido: MapRegion[];
  sigungu: MapSigungu[];
};

export const KOREA_MAP = data as unknown as KoreaRegions;

/**
 * 지도 출처 글(통계청 SGIS 공공누리 1유형). 2026-11-11 사용자 요청으로 지도 위에서는 뺐다.
 * 공공누리 1유형은 출처를 표시해야 쓸 수 있는 자료다. 지도 위가 아니어도 앱 안 어딘가(설정의 정보 화면 등)에는 적어야 한다
 */
export const KOREA_MAP_CREDIT = '지도 출처: 통계청 SGIS';

const { lat0, minX, minY, scale } = KOREA_MAP.projection;
const K = Math.cos((lat0 * Math.PI) / 180);

/** 위도·경도 → 지도 좌표(viewBox 0~width) */
export function projectLatLng(lat: number, lng: number): MapPoint {
  return [(lng * K - minX) * scale, (-lat - minY) * scale];
}

/** 지도 좌표 → 위도·경도 */
export function unprojectPoint([x, y]: MapPoint): { lat: number; lng: number } {
  return { lat: -(y / scale + minY), lng: (x / scale + minX) / K };
}

const SIGUNGU = new Map(KOREA_MAP.sigungu.map((r) => [r.code, r]));
const SIDO = new Map(KOREA_MAP.sido.map((r) => [r.code, r]));

/** 지역 코드(시도·시군구 어느 쪽이든)로 경계 찾기 */
export function findMapRegion(code: string): MapRegion | undefined {
  return SIGUNGU.get(code) ?? SIDO.get(code);
}

/** 시군구 코드의 시도 코드. 시도 코드면 그대로 */
export function sidoCodeOf(code: string): string | undefined {
  return SIGUNGU.get(code)?.parent ?? (SIDO.has(code) ? code : undefined);
}

const SIDO_SHORT: Record<string, string> = {
  경기도: '경기',
  충청북도: '충북',
  충청남도: '충남',
  경상북도: '경북',
  경상남도: '경남',
};

/** 시도 짧은 이름. "강원특별자치도" → "강원", "경상북도" → "경북", "전남광주통합특별시" → "전남광주" */
export function shortSidoName(name: string): string {
  return (
    SIDO_SHORT[name] ?? name.replace(/(통합특별시|특별자치시|특별자치도|특별시|광역시|도)$/, '')
  );
}

/** 이름표용 짧은 이름. "강원특별자치도 강릉시" → "강릉" */
export function shortRegionName(name: string): string {
  const last = name.split(' ').pop() ?? name;
  if (last.length <= 2) return last;
  return last.replace(/(특별자치시|특별자치도|특별시|광역시|시|군|구)$/, '');
}

/** 전국 범위(GET /home/map bbox). "서,남,동,북" 경도·위도 */
export function koreaBbox(): string {
  const nw = unprojectPoint([0, 0]);
  const se = unprojectPoint([KOREA_MAP.width, KOREA_MAP.height]);
  return [nw.lng, se.lat, se.lng, nw.lat].map((v) => v.toFixed(4)).join(',');
}

/**
 * 처음 화면에 맞출 범위(본토 + 제주). 울릉도·독도·옹진 섬은 넣으면 지도가 너무 작아져서 뺀다.
 * 손가락으로 옮기면 볼 수 있다. korea-regions.json이 바뀌면 다시 계산한다
 */
export const MAINLAND_BOUNDS = { x0: 175, y0: 0, x1: 686, y1: 929 } as const;

/** 배율 1에서 지도 1단위가 몇 px인지. 본토가 보이는 높이 안에 들어오게 맞춘다(KoreaMap과 같은 계산) */
export function mapFit(box: { width: number; height: number }, insetTop = 0, insetBottom = 0) {
  const b = MAINLAND_BOUNDS;
  const visibleH = Math.max(1, box.height - insetTop - insetBottom);
  return Math.min(box.width / (b.x1 - b.x0), visibleH / (b.y1 - b.y0)) * 0.9;
}

/**
 * 같은 모양·색은 경로 하나로 합쳐 그린다(KoreaMap). 시도·시군구를 따로 그리면 경로가 500개 가까이 되어,
 * 탭을 오갈 때 홈 한 장면에 최대 125ms가 걸렸다(11/11 갤럭시, 개발 모드를 꺼도 같음).
 * 지도 자료의 경로는 모두 같은 방향으로 돌고, 시도 안 구멍(광역시 자리)은 그 광역시 경로가 다시 채워서
 * 기본 칠하기 규칙(nonzero)으로 합쳐도 모양이 같다
 */
export function joinPaths(list: readonly { d: string }[]): string {
  return list.map((r) => r.d).join(' ');
}
export const SIDO_PATH = joinPaths(KOREA_MAP.sido);
export const SIGUNGU_PATH = joinPaths(KOREA_MAP.sigungu);

/** 시군구 면을 칠할 색끼리 묶는다([색, 합친 경로]). 대부분 기본색(fallback)이라 경로 몇 개로 끝난다 */
export function sigunguPathsByColor(
  fills: Readonly<Record<string, string>>,
  fallback: string,
): [string, string][] {
  const groups = new Map<string, MapSigungu[]>();
  for (const r of KOREA_MAP.sigungu) {
    const color = fills[r.code] ?? fills[r.parent] ?? fallback;
    const list = groups.get(color);
    if (list) list.push(r);
    else groups.set(color, [r]);
  }
  return [...groups].map(([color, list]) => [color, joinPaths(list)]);
}
