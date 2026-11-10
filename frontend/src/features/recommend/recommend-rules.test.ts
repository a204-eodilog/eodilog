import { describe, expect, it } from '@jest/globals';

import {
  basisCells,
  insufficientLines,
  loadingStep,
  loadingSteps,
  peopleWord,
  regionCardText,
  splitItems,
  viewState,
} from './recommend-rules';
import { placeItem, regionItem, result } from './testing';

describe('splitItems', () => {
  it('여행지와 맛집·스팟으로 나누고 빈 항목은 뺀다', () => {
    const { regions, places } = splitItems([
      regionItem('r1', '영도 흰여울 일대'),
      placeItem('p1', '자갈치 회 골목'),
      { type: 'PLACE', place: null, region: null, reason: '빈 항목' },
      { type: 'REGION', place: null, region: null, reason: '빈 항목' },
    ]);
    expect(regions.map((r) => r.region.name)).toEqual(['영도 흰여울 일대']);
    expect(places.map((p) => p.place.name)).toEqual(['자갈치 회 골목']);
  });
});

describe('viewState', () => {
  it('작업 상태와 결과로 화면 상태를 정한다', () => {
    expect(viewState(null, false, 3)).toBe('loading');
    expect(viewState(result({ status: 'RUNNING' }), false, 3)).toBe('loading');
    expect(viewState(result({ status: 'FAILED' }), false, 3)).toBe('failed');
    expect(viewState(result({ status: 'CANCELLED' }), false, 3)).toBe('failed');
    expect(viewState(result(), true, 3)).toBe('failed');
    expect(viewState(result({ insufficientData: true }), false, 0)).toBe('insufficient');
    expect(viewState(result(), false, 0)).toBe('noOverlap');
    expect(viewState(result(), false, 3)).toBe('success');
    // 겹친 곳 수를 아직 모르면 성공으로 본다
    expect(viewState(result(), false, null)).toBe('success');
  });
});

describe('생성 중', () => {
  it('흐른 시간이나 진행률로 단계를 넘긴다', () => {
    expect(loadingStep(0)).toBe(0);
    expect(loadingStep(2000)).toBe(1);
    expect(loadingStep(5000)).toBe(2);
    expect(loadingStep(500, 40)).toBe(1);
    expect(loadingStep(500, 70)).toBe(2);
  });

  it('단계 문구는 모은 장소 수와 사람 수를 넣는다', () => {
    expect(loadingSteps(5, 3)).toEqual([
      '모은 장소 5곳 살펴보기',
      '세 사람 취향 맞춰 보기',
      '여행지와 장소 고르기',
    ]);
    expect(loadingSteps(0, 0)[0]).toBe('모은 장소 살펴보기');
    expect(peopleWord(0)).toBe('동행');
    expect(peopleWord(1)).toBe('한 사람');
    expect(peopleWord(12)).toBe('12명');
  });
});

describe('문구', () => {
  it('자료 부족 두 줄', () => {
    expect(insufficientLines({ sharedPlaceCount: 1, usedMemberCount: 1 })).toEqual([
      '모은 장소 1곳 · 3곳부터 추천해요',
      '취향 고른 사람 1명 · 2명부터 추천해요',
    ]);
  });

  it('근거 세 칸. 겹침은 있을 때만, 여행지와 기간이 없으면 미정', () => {
    expect(
      basisCells({ sharedPlaceCount: 5, usedMemberCount: 3 }, 3, '부산', '11.14 – 11.15'),
    ).toEqual([
      { value: '5곳', extra: '겹침 3', label: '모은 장소' },
      { value: '3명', label: '공개 취향' },
      { value: '부산', label: '11.14 – 11.15' },
    ]);
    const empty = basisCells({ sharedPlaceCount: 2, usedMemberCount: 1 }, 0, null, null);
    expect(empty[0].extra).toBeUndefined();
    expect(empty[2]).toEqual({ value: '여행지 미정', label: '기간 미정' });
  });
});

describe('여행지 추천 카드 글자', () => {
  it('시·도로 시작하면 나머지를 제목, 시·도를 위치로 쓴다', () => {
    expect(regionCardText('강원특별자치도 강릉시')).toEqual({ title: '강릉시', location: '강원' });
    expect(regionCardText('전라남도 여수시')).toEqual({ title: '여수시', location: '전남' });
    expect(regionCardText('부산광역시 해운대구')).toEqual({ title: '해운대구', location: '부산' });
  });

  it('시·도로 시작하지 않으면 이름 그대로, 위치 줄 없음', () => {
    expect(regionCardText('영도 흰여울 일대')).toEqual({
      title: '영도 흰여울 일대',
      location: null,
    });
    expect(regionCardText('부산광역시')).toEqual({ title: '부산광역시', location: null });
  });
});
