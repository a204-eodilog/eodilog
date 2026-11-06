import fs from 'node:fs';
const [src, seedPath, out] = process.argv.slice(2);
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8').replace(/^﻿/, ''));
const byCode = new Map(seed.nodes.map((n) => [n.code, n]));
const g = JSON.parse(fs.readFileSync(src, 'utf8'));
const miss = new Map();
let ok = 0;
for (const f of g.features) {
  const sgg = f.properties.sgg;
  // 일반구(예: 41111 수원시 장안구)는 우리 지역에서 시(41110)로 묶여 있다
  const cands = [sgg + '00000', sgg.slice(0, 4) + '000000'];
  let node = cands.map((c) => byCode.get(c)).find((n) => n && n.parentCode);
  // 세종은 시군구 없이 시도 하나뿐이라 자기 자신을 상위로 둔다
  if (!node && sgg === '36110') {
    const s = byCode.get('3611000000');
    node = { ...s, parentCode: s.code };
  }
  if (!node) {
    miss.set(sgg + ' ' + f.properties.sidonm + ' ' + f.properties.sggnm, 1);
    continue;
  }
  ok++;
  f.properties = { code: node.code, parent: node.parentCode, name: node.name };
}
g.features = g.features.filter((f) => f.properties.code);
fs.writeFileSync(out, JSON.stringify(g));
const used = new Set(g.features.map((f) => f.properties.code));
const unusedSeed = seed.nodes.filter((n) => n.parentCode && !used.has(n.code));
console.log('읍면동 맞음', ok, '안 맞음', [...miss.keys()]);
console.log(
  '경계 없는 우리 시군구',
  unusedSeed.map((n) => n.code + ' ' + n.name),
);
console.log(
  '시군구 수',
  used.size,
  '시도 수',
  new Set(g.features.map((f) => f.properties.parent)).size,
);
