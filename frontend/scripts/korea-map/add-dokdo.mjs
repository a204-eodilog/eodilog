import fs from 'node:fs';
// 단순화에서 사라지는 독도를 원본 모양에서 가져와 울릉군에 다시 붙인다(점 12개 안팎으로 줄여서)
const full = JSON.parse(fs.readFileSync('ulleung-full.geojson', 'utf8')).features[0].geometry;
const polys = full.type === 'Polygon' ? [full.coordinates] : full.coordinates;
const dokdo = polys
  .filter((p) => Math.max(...p[0].map((c) => c[0])) > 131.5)
  .map((p) => {
    const ring = p[0];
    const step = Math.max(1, Math.floor(ring.length / 12));
    const r = ring.filter((_, i) => i % step === 0);
    r.push(r[0]);
    return [r];
  });
const sgg = JSON.parse(fs.readFileSync('sgg.geojson', 'utf8'));
const f = sgg.features.find((x) => x.properties.code === '4794000000');
const cur = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
f.geometry = { type: 'MultiPolygon', coordinates: [...cur, ...dokdo] };
fs.writeFileSync('sgg.geojson', JSON.stringify(sgg));
console.log(
  '독도 조각',
  dokdo.length,
  '점',
  dokdo.map((d) => d[0].length),
);
