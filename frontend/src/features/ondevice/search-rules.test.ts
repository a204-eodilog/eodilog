import { describe, expect, it } from '@jest/globals';

import {
  aiModeBlocks,
  groupSimilar,
  needsDownloadConfirm,
  packVector,
  rankBySimilarity,
  relevantOnly,
  searchStatusText,
  topicCounts,
  tripTimeRange,
} from './search-rules';

const v = (...xs: number[]) => Float32Array.from(xs);

describe('rankBySimilarity', () => {
  it('검색어 벡터와 가까운 사진부터 점수와 함께 돌려준다', () => {
    const ranked = rankBySimilarity(v(1, 0), [
      { id: 'a', f: [0, 1] },
      { id: 'b', f: [1, 0] },
      { id: 'c', f: [0.6, 0.8] },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(ranked[0].score).toBeCloseTo(1);
    expect(ranked[1].score).toBeCloseTo(0.6);
  });

  it('limit만큼만 돌려준다', () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, f: [i, 1] }));
    expect(rankBySimilarity(v(1, 0), entries, 2).map((r) => r.id)).toEqual(['p4', 'p3']);
  });

  it('점수가 같으면 넣은 순서를 지킨다', () => {
    const ranked = rankBySimilarity(v(1, 0), [
      { id: 'x', f: [1, 0] },
      { id: 'y', f: [1, 0] },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['x', 'y']);
  });
});

describe('packVector', () => {
  it('캐시 크기를 줄이려고 소수 넷째 자리까지만 남긴다', () => {
    expect(packVector(v(0.123456, -0.98768))).toEqual([0.1235, -0.9877]);
  });
});

describe('searchStatusText', () => {
  it('처음에는 무엇을 하는지 알려 준다', () => {
    expect(searchStatusText({ phase: 'idle', done: 0, total: 0 })).toBe(
      '사진을 서버로 보내지 않고 폰 안에서 찾아요',
    );
  });

  it('모델을 여는 중이면 그렇게 말한다', () => {
    expect(searchStatusText({ phase: 'loading-model', done: 0, total: 30 })).toBe(
      '폰 AI 모델을 여는 중이에요',
    );
  });

  it('사진을 준비하는 동안 진행 수를 보여 준다', () => {
    expect(searchStatusText({ phase: 'indexing', done: 12, total: 30 })).toBe(
      '사진 30장 중 12장을 준비했어요',
    );
  });

  it('다 준비되면 준비한 사진 수를 알려 준다', () => {
    expect(searchStatusText({ phase: 'ready', done: 30, total: 30 })).toBe(
      '사진 30장에서 찾을 수 있어요',
    );
  });

  it('실패하면 다시 시도하라고 한다', () => {
    expect(searchStatusText({ phase: 'error', done: 3, total: 30 })).toBe(
      '폰 AI를 쓰지 못했어요. 검색창을 다시 눌러 주세요',
    );
  });
});

describe('groupSimilar', () => {
  it('기준 이상으로 닮은 사진끼리 같은 묶음 키를 주고, 혼자인 사진은 null', () => {
    const groups = groupSimilar(
      [
        { id: 'a', f: [1, 0] },
        { id: 'b', f: [0.99, 0.141] },
        { id: 'c', f: [0, 1] },
      ],
      0.95,
    );
    expect(groups.get('a')).not.toBeNull();
    expect(groups.get('a')).toBe(groups.get('b'));
    expect(groups.get('c')).toBeNull();
  });

  it('a~b, b~c면 a~c가 기준 아래여도 한 묶음(연속 촬영이 이어진다)', () => {
    const groups = groupSimilar(
      [
        { id: 'a', f: [1, 0] },
        { id: 'b', f: [0.96, 0.28] },
        { id: 'c', f: [0.85, 0.53] },
      ],
      0.95,
    );
    expect(new Set([groups.get('a'), groups.get('b'), groups.get('c')]).size).toBe(1);
  });
});

describe('topicCounts', () => {
  it('주제별 장수와 전체 장수', () => {
    expect(topicCounts([{ topic: 'FOOD' }, { topic: 'FOOD' }, { topic: 'PEOPLE' }])).toEqual({
      ALL: 3,
      LANDSCAPE: 0,
      FOOD: 2,
      PEOPLE: 1,
      OTHER: 0,
    });
  });
});

describe('tripTimeRange', () => {
  it('여행 첫날 0시부터 마지막 날 다음 날 0시 전까지(기기 시간대)', () => {
    const r = tripTimeRange('2026-11-15', '2026-11-17');
    expect(r).toEqual({
      after: new Date(2026, 10, 15).getTime(),
      before: new Date(2026, 10, 18).getTime(),
    });
  });

  it('날짜가 없으면 null', () => {
    expect(tripTimeRange(null, null)).toBeNull();
  });
});

describe('needsDownloadConfirm', () => {
  it('와이파이·유선이 아니면 받기 전에 묻는다', () => {
    expect(needsDownloadConfirm('wifi')).toBe(false);
    expect(needsDownloadConfirm('ethernet')).toBe(false);
    expect(needsDownloadConfirm('cellular')).toBe(true);
    expect(needsDownloadConfirm('unknown')).toBe(true);
    expect(needsDownloadConfirm(null)).toBe(true);
  });
});

describe('aiModeBlocks', () => {
  it('AI 사진 분류를 끈 사용자는 폰 정리를 쓰지 않는다', () => {
    expect(aiModeBlocks('OFF')).toBe(true);
    expect(aiModeBlocks('CONFIRM')).toBe(false);
    expect(aiModeBlocks('AUTO')).toBe(false);
    expect(aiModeBlocks(undefined)).toBe(false);
  });
});

describe('relevantOnly', () => {
  it('1위 점수의 비율보다 낮은 결과는 뺀다', () => {
    const ranked = [
      { id: 'sea1', score: 0.107 },
      { id: 'sea2', score: 0.094 },
      { id: 'sea3', score: 0.081 },
      { id: 'menu', score: 0.077 },
      { id: 'lake', score: 0.063 },
    ];
    expect(relevantOnly(ranked, 0.75).map((r) => r.id)).toEqual(['sea1', 'sea2', 'sea3']);
  });

  it('점수가 고르면 모두 남긴다', () => {
    const ranked = [
      { id: 'a', score: 0.18 },
      { id: 'b', score: 0.17 },
      { id: 'c', score: 0.169 },
    ];
    expect(relevantOnly(ranked, 0.75)).toHaveLength(3);
  });

  it('1위 점수가 0 이하이거나 결과가 없으면 그대로 둔다', () => {
    expect(relevantOnly([], 0.75)).toEqual([]);
    const flat = [
      { id: 'a', score: -0.01 },
      { id: 'b', score: -0.2 },
    ];
    expect(relevantOnly(flat, 0.75)).toEqual(flat);
  });
});
