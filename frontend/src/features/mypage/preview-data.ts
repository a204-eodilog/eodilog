import type { MyPageSummary } from './types';

/** Figma S37 기본: 다녀온 여행 4개 · 게시 1개, 핀 3개(봄 경주 게시, 추석 전주·겨울 여행 나만 봐요) */
export const PREVIEW_SUMMARY: MyPageSummary = {
  nickname: '하늘',
  profileImageUrl: null,
  visitedCount: 4,
  postedCount: 1,
  tripCount: 7,
  pinlessCount: 1,
  friendCount: 5,
  pins: [
    { regionCode: '5211000000', label: '추석 전주', posted: false, tripIds: ['t1'] },
    { regionCode: '4713000000', label: '봄 경주', posted: true, tripIds: ['t2'] },
    { regionCode: '2635000000', label: '겨울 여행', posted: false, tripIds: ['t3'] },
  ],
};

/** Figma S37 기록 없음 */
export const PREVIEW_EMPTY: MyPageSummary = {
  ...PREVIEW_SUMMARY,
  visitedCount: 0,
  postedCount: 0,
  tripCount: 0,
  pinlessCount: 0,
  pins: [],
};
