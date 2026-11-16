import { describe, expect, it } from '@jest/globals';

import { kindFromCategory, placeKind, placeKindLook } from './place-kind';

describe('서버가 준 분류로 정하기', () => {
  it('분류 글이 있으면 이름보다 분류를 따른다', () => {
    expect(placeKind('호우섬 더현대서울점', '음식점>중식')).toBe('food');
    expect(placeKind('테라로사', '카페,디저트>카페')).toBe('cafe');
    expect(placeKind('씨마크', '숙박>호텔')).toBe('stay');
    expect(placeKind('경포', '여행,명소>해수욕장')).toBe('nature');
    // 이름은 카페처럼 보여도 분류가 음식점이면 음식점
    expect(placeKind('카페거리 국수', '음식점>한식')).toBe('food');
  });

  it('분류가 없거나 알 수 없는 글이면 이름으로 짐작한다', () => {
    expect(kindFromCategory(null)).toBeNull();
    expect(kindFromCategory('  ')).toBeNull();
    expect(placeKind('호우섬 더현대서울점')).toBe('place');
    expect(placeKind('광안리 바다뷰 카페', '기타')).toBe('cafe');
  });
});

describe('placeKind', () => {
  it('이름에 든 낱말로 종류를 짐작한다', () => {
    expect(placeKind('만족오향족발 시청점')).toBe('food');
    expect(placeKind('서면 돼지국밥')).toBe('food');
    expect(placeKind('광안리 바다뷰 카페')).toBe('cafe');
    expect(placeKind('스타벅스 해운대점')).toBe('cafe');
    expect(placeKind('켄싱턴호텔 설악')).toBe('stay');
    expect(placeKind('국립중앙박물관')).toBe('culture');
    expect(placeKind('경복궁')).toBe('culture');
    expect(placeKind('해운대 해변')).toBe('nature');
    expect(placeKind('한라산')).toBe('nature');
    expect(placeKind('자갈치시장')).toBe('shop');
  });

  it('카페·숙소 이름에 음식 낱말이 섞여도 먼저 맞는 종류를 쓴다', () => {
    expect(placeKind('고기리 베이커리 카페')).toBe('cafe');
    expect(placeKind('바다 펜션 식당')).toBe('stay');
  });

  it('한 글자 낱말은 이름 끝에 올 때만 본다. 도시 이름을 자연으로 보지 않는다', () => {
    expect(placeKind('부산')).toBe('place');
    expect(placeKind('부산역')).toBe('place');
    expect(placeKind('울산대교')).toBe('place');
  });

  it('맞는 낱말이 없으면 장소', () => {
    expect(placeKind('감천문화마을')).toBe('culture');
    expect(placeKind('서울역')).toBe('place');
    expect(placeKindLook('서울역')).toMatchObject({ icon: 'map-pin', label: '장소' });
    expect(placeKindLook('광안리 바다뷰 카페')).toMatchObject({ icon: 'coffee', label: '카페' });
  });
});

describe('관광공사 분류', () => {
  it('관광지는 이름을 먼저 보고, 단서가 없으면 자연이다', () => {
    expect(placeKind('흰여울문화마을', '관광지')).toBe('culture');
    expect(placeKind('강문해변', '관광지')).toBe('nature');
    expect(placeKind('두물머리', '관광지')).toBe('nature');
  });
  it('다른 관광공사 분류도 읽는다', () => {
    expect(placeKind('어딘가', '문화시설')).toBe('culture');
    expect(placeKind('어딘가', '축제공연행사')).toBe('culture');
    expect(placeKind('어딘가', '레포츠')).toBe('nature');
    expect(placeKind('어딘가', '숙박')).toBe('stay');
    expect(placeKind('어딘가', '음식점')).toBe('food');
    expect(placeKind('어딘가', '쇼핑')).toBe('shop');
  });
});
