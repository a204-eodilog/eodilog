# 한국 시도·시군구 SVG 경계 (S05 홈·S37·S40·S07 물든 지도용)

결과물은 `frontend/assets/map/korea-regions.json`(약 199KB). 화면은 `@/lib/korea-map`으로 읽는다.

## 모양

```ts
type KoreaRegions = {
  source: string; // 출처 문구
  projection: { lat0: number; minX: number; minY: number; scale: number };
  width: 1000;
  height: number; // SVG viewBox = `0 0 ${width} ${height}`
  sido: { code: string; name: string; d: string; point: [number, number] }[]; // 16개
  sigungu: { code: string; parent: string; name: string; d: string; point: [number, number] }[]; // 230개
};
```

- `code`는 우리 `regions.code`(법정동 10자리)와 그대로 같다. 2026-10 시드 기준이라 전남광주통합특별시(12…)가 반영돼 있다. 세종은 시도이면서 시군구 한 칸(`code`·`parent` 모두 `3611000000`).
- 일반구(수원시 장안구 등)는 우리 지역처럼 시 하나로 합쳐 있다.
- `d`는 SVG path 문자열, `point`는 그 지역 안쪽 점(핀·이름표 자리).
- 울릉도·독도 포함. 독도는 단순화에서 지워져서 원본 모양을 따로 붙였다. 다시 만들 때 독도가 빠지지 않게 주의.

## 경위도 → 화면 좌표 (사진 핀 등)

```ts
const K = Math.cos((projection.lat0 * Math.PI) / 180);
const x = (lng * K - projection.minX) * projection.scale;
const y = (-lat - projection.minY) * projection.scale;
```

## 출처 (화면에 반드시 표기)

- 화면 문구: "지도 출처: 통계청 SGIS" (Figma와 같음)
- 원본: 통계청 SGIS 행정구역 경계(공공누리 제1유형: 출처표시)
- 가공 자료: github.com/vuski/admdongkor ver20261001(데이터 CC BY 4.0)을 시군구·시도로 합치고 단순화
- 값 문서에도 위 세 줄을 적는다.

## 다시 만들기 (경계가 바뀔 때만)

`scripts/` 순서: `map-codes.mjs`(읍면동 → 우리 시군구 코드) → mapshaper로 합치기·단순화(1.5%, keep-shapes, 2km² 미만 섬 제거) → `add-dokdo.mjs` → 시도로 합치기·안쪽 점 → `build-svg.mjs`. mapshaper는 프로젝트 의존성에 넣지 않는다(임시로만 설치).
