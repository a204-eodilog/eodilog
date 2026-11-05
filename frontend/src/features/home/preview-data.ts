import type { HomeRecommendation, RegionMark } from './types';

/** /dev/home 예시 값. 이름은 실제 팀원이 아닌 예시 이름 */
const mark = (
  regionCode: string,
  name: string,
  memberNames: string[],
  visitCount = memberNames.length,
): RegionMark => ({
  regionCode,
  name,
  memberCount: memberNames.length,
  memberIds: memberNames,
  memberNames,
  coverUrl: null,
  visitCount,
  feedIds: [],
});

/** 전국 보기. 서로 떨어진 네 곳 */
export const PREVIEW_MARKS: RegionMark[] = [
  mark('5115000000', '강릉', ['하늘', '가람', '나래']),
  mark('5211000000', '전주', ['다온', '하늘']),
  mark('2635000000', '해운대', ['나래', '다온']),
  mark('5011000000', '제주', ['나래', '다온']),
];

/** 강원 내륙 한 곳(묶음 확인용) */
export const PREVIEW_CHUNCHEON: RegionMark = mark('5111000000', '춘천', ['다온']);

/** 확대 보기(강원 동해안). Figma S05 '지도 확대'와 같은 세 곳 */
export const PREVIEW_ZOOM_MARKS: RegionMark[] = [
  mark('5121000000', '속초', ['하늘']),
  mark('5183000000', '양양', ['나래']),
  mark('5115000000', '강릉', ['하늘', '가람', '나래']),
  mark('5182000000', '고성', ['다온']),
  mark('5117000000', '동해', ['가람', '다온']),
  mark('5123000000', '삼척', ['하늘']),
  mark('5176000000', '평창', ['하늘', '가람', '나래', '다온']),
];

export const PREVIEW_RECOMMENDATIONS: HomeRecommendation[] = [
  {
    id: 'r1',
    kind: 'trip',
    title: '제주 동쪽 한 바퀴',
    meta: '하늘',
    nights: '2박 3일',
    imageUrl: null,
  },
  {
    id: 'r2',
    kind: 'place',
    title: '명주동 골목 카페',
    meta: '강릉 명주동',
    nights: null,
    imageUrl: null,
  },
  { id: 'r3', kind: 'trip', title: '여수 밤바다', meta: '가람', nights: '1박 2일', imageUrl: null },
  {
    id: 'r4',
    kind: 'place',
    title: '안목 바다뷰 카페',
    meta: '강릉 견소동',
    nights: null,
    imageUrl: null,
  },
  {
    id: 'r5',
    kind: 'trip',
    title: '경주 느린 산책',
    meta: '다온',
    nights: '1박 2일',
    imageUrl: null,
  },
  {
    id: 'r6',
    kind: 'place',
    title: '경포호 산책길',
    meta: '강릉 저동',
    nights: null,
    imageUrl: null,
  },
];

export const PREVIEW_LOCKED = [
  { name: '하늘', regionCode: '4100000000' },
  { name: '가람', regionCode: '4711000000' },
  { name: '나래', regionCode: '1215000000' },
  { name: '다온', regionCode: '4831000000' },
];
