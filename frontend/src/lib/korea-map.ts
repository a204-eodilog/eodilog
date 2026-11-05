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

/** 화면에 표기할 지도 출처 (통계청 SGIS 공공누리 1유형) */
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
