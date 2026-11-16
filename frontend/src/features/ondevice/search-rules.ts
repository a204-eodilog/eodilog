// 폰 안 사진 검색의 순수 규칙(모델·파일 없이 시험할 수 있는 부분)

export type Ranked = { id: string; score: number };

/** 검색어 벡터와 사진 벡터의 내적(둘 다 정규화돼 있어 코사인 유사도)으로 가까운 순. 같은 점수는 넣은 순서 */
export function rankBySimilarity(
  query: ArrayLike<number>,
  entries: readonly { id: string; f: ArrayLike<number> }[],
  limit = 30,
): Ranked[] {
  const scored = entries.map((e, i) => {
    let s = 0;
    for (let k = 0; k < query.length; k++) s += query[k] * e.f[k];
    return { id: e.id, score: s, i };
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.slice(0, limit).map(({ id, score }) => ({ id, score }));
}

/**
 * 1위와 비교해 너무 덜 비슷한 결과는 뺀다(점수는 높은 순으로 정렬돼 있어야 한다).
 * 바다 사진이 몇 장뿐인 앨범에서 '바다'를 찾으면 그 뒤로 관련 없는 사진이 줄줄이 붙는 것을 막는다.
 * 1위 점수가 0 이하면 비율이 뜻이 없어 그대로 둔다
 */
export function relevantOnly(ranked: readonly Ranked[], ratio: number): Ranked[] {
  const top = ranked[0]?.score ?? 0;
  if (top <= 0) return [...ranked];
  return ranked.filter((r) => r.score >= top * ratio);
}

/** 캐시에 저장할 때 소수 넷째 자리까지만 남긴다(검색 순위는 거의 바뀌지 않고 파일은 절반쯤 줄어든다) */
export function packVector(f: ArrayLike<number>): number[] {
  return Array.from(f, (x) => Math.round(x * 1e4) / 1e4);
}

export type SearchPhase = 'idle' | 'loading-model' | 'indexing' | 'ready' | 'error';

export function searchStatusText(s: { phase: SearchPhase; done: number; total: number }): string {
  switch (s.phase) {
    case 'idle':
      return '사진을 서버로 보내지 않고 폰 안에서 찾아요';
    case 'loading-model':
      return '폰 AI 모델을 여는 중이에요';
    case 'indexing':
      return `사진 ${s.total}장 중 ${s.done}장을 준비했어요`;
    case 'ready':
      return `사진 ${s.total}장에서 찾을 수 있어요`;
    case 'error':
      return '폰 AI를 쓰지 못했어요. 검색창을 다시 눌러 주세요';
  }
}

/**
 * 비슷한 사진 묶기. 두 사진의 유사도가 기준 이상이면 잇고, 이어진 사진끼리 한 묶음이다(연속 촬영이 사슬로 이어진다).
 * 2장 이상 묶인 사진은 같은 키, 혼자인 사진은 null. 키는 이 목록 안에서만 뜻이 있다(서버가 새 id를 만든다)
 */
export function groupSimilar(
  entries: readonly { id: string; f: ArrayLike<number> }[],
  threshold: number,
): Map<string, string | null> {
  const parent = entries.map((_, i) => i);
  const root = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i].f;
      const b = entries[j].f;
      let s = 0;
      for (let k = 0; k < a.length; k++) s += a[k] * b[k];
      if (s >= threshold) parent[root(j)] = root(i);
    }
  }
  const size = new Map<number, number>();
  entries.forEach((_, i) => size.set(root(i), (size.get(root(i)) ?? 0) + 1));
  return new Map(
    entries.map((e, i) => [e.id, (size.get(root(i)) ?? 0) >= 2 ? `g${root(i)}` : null]),
  );
}

export type TopicKey = 'LANDSCAPE' | 'FOOD' | 'PEOPLE' | 'OTHER';

/** 주제 칩 수. ALL은 전체 */
export function topicCounts(
  items: readonly { topic: TopicKey }[],
): Record<TopicKey | 'ALL', number> {
  const out = { ALL: items.length, LANDSCAPE: 0, FOOD: 0, PEOPLE: 0, OTHER: 0 };
  for (const it of items) out[it.topic] += 1;
  return out;
}

/** 여행 기간('YYYY-MM-DD')을 기기 시간대의 [첫날 0시, 마지막 날 다음 날 0시) 밀리초로. 날짜가 없으면 null */
export function tripTimeRange(
  startDate: string | null,
  endDate: string | null,
): { after: number; before: number } | null {
  const parse = (d: string | null) => {
    const m = d ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(d) : null;
    return m ? [Number(m[1]), Number(m[2]) - 1, Number(m[3])] : null;
  };
  const s = parse(startDate);
  const e = parse(endDate);
  if (!s || !e) return null;
  return {
    after: new Date(s[0], s[1], s[2]).getTime(),
    before: new Date(e[0], e[1], e[2] + 1).getTime(),
  };
}

/** 모델(약 190MB)을 받기 전에 물어야 하는지. 와이파이·유선이 아니면(모바일 데이터·알 수 없음) 묻는다 */
export function needsDownloadConfirm(networkType: string | null | undefined): boolean {
  return networkType !== 'wifi' && networkType !== 'ethernet';
}

/** 설정에서 AI 사진 분류를 끈 사용자(OFF)는 폰 정리를 쓰지 않는다. 설정을 아직 모르면 막지 않는다 */
export function aiModeBlocks(mode: 'AUTO' | 'CONFIRM' | 'OFF' | undefined): boolean {
  return mode === 'OFF';
}
