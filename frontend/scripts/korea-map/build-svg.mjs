import fs from 'node:fs';
const W = process.argv[2],
  OUT = process.argv[3];
const read = (f) => JSON.parse(fs.readFileSync(`${W}/${f}`, 'utf8'));
const sgg = read('sgg.geojson'),
  sido = read('sido.geojson');
const sggPts = read('sgg-pts.geojson'),
  sidoPts = read('sido-pts.geojson');
const seed = JSON.parse(fs.readFileSync(`${W}/seed.json`, 'utf8').replace(/^﻿/, ''));
const nameOf = new Map(seed.nodes.map((n) => [n.code, n.name]));
// 경위도 → SVG 좌표. 등장방형 + 위도 36.5° 보정. 앱의 핀도 같은 식으로 계산한다
const LAT0 = 36.5,
  K = Math.cos((LAT0 * Math.PI) / 180);
let minX = Infinity,
  maxX = -Infinity,
  minY = Infinity,
  maxY = -Infinity;
const each = (geom, fn) => {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const p of polys) for (const r of p) for (const c of r) fn(c);
};
for (const f of sido.features)
  each(f.geometry, ([lon, lat]) => {
    const x = lon * K,
      y = -lat;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
const WIDTH = 1000,
  S = WIDTH / (maxX - minX),
  HEIGHT = Math.ceil((maxY - minY) * S);
const px = (lon) => +((lon * K - minX) * S).toFixed(1),
  py = (lat) => +((-lat - minY) * S).toFixed(1);
const toPath = (geom) => {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let d = '';
  for (const p of polys)
    for (const r of p) {
      d += r.map(([lon, lat], i) => `${i ? 'L' : 'M'}${px(lon)} ${py(lat)}`).join('') + 'Z';
    }
  return d.replace(/L/g, ' ').replace(/ (?=M)/g, '');
};
const ptOf = (pts, key) => {
  const m = new Map(pts.features.map((f) => [f.properties[key], f.geometry.coordinates]));
  return (code) => {
    const c = m.get(code);
    return c ? [px(c[0]), py(c[1])] : null;
  };
};
const sidoPt = ptOf(sidoPts, 'parent'),
  sggPt = ptOf(sggPts, 'code');
const data = {
  source:
    '통계청 SGIS 행정구역 경계(공공누리 1유형) · vuski/admdongkor ver20261001(CC BY 4.0) 가공',
  projection: { lat0: LAT0, minX: +minX.toFixed(6), minY: +minY.toFixed(6), scale: +S.toFixed(6) },
  width: WIDTH,
  height: HEIGHT,
  sido: sido.features.map((f) => ({
    code: f.properties.parent,
    name: nameOf.get(f.properties.parent),
    d: toPath(f.geometry),
    point: sidoPt(f.properties.parent),
  })),
  sigungu: sgg.features.map((f) => ({
    code: f.properties.code,
    parent: f.properties.parent,
    name: f.properties.name,
    d: toPath(f.geometry),
    point: sggPt(f.properties.code),
  })),
};
fs.writeFileSync(OUT, JSON.stringify(data));
console.log(
  '크기',
  fs.statSync(OUT).size,
  'viewBox',
  WIDTH,
  HEIGHT,
  '시도',
  data.sido.length,
  '시군구',
  data.sigungu.length,
  '핀 없음',
  data.sigungu.filter((s) => !s.point).length,
);
