import type { Feed, FeedPlace } from './types';

const user = (id: string, nickname: string) => ({
  id,
  nickname,
  profileImageUrl: null,
  accountVisibility: 'PUBLIC' as const,
  followingStatus: 'ACCEPTED' as const,
  followedByStatus: 'NONE' as const,
});

const place = (id: string, name: string, latitude: number, longitude: number): FeedPlace => ({
  id,
  name,
  address: null,
  latitude,
  longitude,
  regionId: null,
  provider: null,
  providerPlaceId: null,
  source: 'PROVIDER',
});

// Figma S07 기본: 강릉 겨울 바다 1박 2일, 장소 5곳
const PLACES = [
  place('p1', '강문 해변', 37.7953, 128.9195),
  place('p2', '안목 바다뷰 카페', 37.7718, 128.9478),
  place('p3', '초당 순두부집', 37.7914, 128.9143),
  place('p4', '경포호 산책길', 37.7976, 128.8986),
  place('p5', '주문진 어시장', 37.8932, 128.8296),
];

// 평점은 정수라 4.5는 두 사람 평가(5·4)의 평균이다. 앞 글이 한 줄 평가로 보인다
const REVIEWS: [string, number, string, string][] = [
  ['p1', 5, '겨울 바다가 맑아서 오래 걸었어요', '하늘'],
  ['p1', 4, '바람이 세요', '가람'],
  ['p2', 4, '창가 자리는 오전에 가야 해요', '하늘'],
  ['p3', 5, '이번 여행 최고의 저녁이었어요', '나래'],
  ['p4', 4, '해 뜰 때 한 바퀴 돌기 좋아요', '가람'],
  ['p5', 4, '주말 점심엔 많이 붐벼요', '하늘'],
  ['p5', 3, '주차가 어려워요', '나래'],
];

/** 미리보기·테스트 모드 공용 예시 공동 피드(서버 Feed 모양) */
export function sampleFeed(id = 'feed-sample'): Feed {
  const items = PLACES.map((p, i) => ({
    id: `item-${i + 1}`,
    place: p,
    day: i < 3 ? 1 : 2,
    order: i < 3 ? i : i - 3,
    startTime: null,
    stayMinutes: null,
  }));
  const leg = (from: number, to: number, mode: string, minutes: number) => ({
    fromItemId: `item-${from}`,
    toItemId: `item-${to}`,
    transportMode: mode,
    durationSeconds: minutes * 60,
    distanceMeters: null,
    geometry: null,
    status: 'AVAILABLE' as const,
    queriedAt: '2026-01-17T09:00:00Z',
  });
  return {
    id,
    tripId: `trip-${id}`,
    title: '강릉 겨울 바다',
    body: '',
    publishedAt: '2026-01-20T09:00:00Z',
    coverPhotoId: 'photo-1',
    regions: [],
    startDate: '2026-01-17',
    endDate: '2026-01-18',
    // 사진은 비워 둔다(주소 없음). 12장이 있다고 보고 3장 + "+9"를 본다
    photos: Array.from({ length: 12 }, (_, i) => ({
      id: `photo-${i + 1}`,
      placeId: i < 5 ? PLACES[i].id : null,
      imageUrl: `/assets/sample-${i + 1}/download?feedId=${id}`,
      caption: null,
    })),
    places: PLACES,
    publicItinerary: {
      items,
      legs: [leg(1, 2, 'WALK', 12), leg(2, 3, 'CAR', 15), leg(4, 5, 'CAR', 30)],
    },
    publicReviews: REVIEWS.map(([placeId, score, body, author], i) => ({
      id: `review-${i + 1}`,
      placeId,
      author: user(`u-${author}`, author),
      score,
      body,
      writtenAt: `2026-01-19T${String(i).padStart(2, '0')}:00:00Z`,
      feedId: id,
    })),
    expenseSummary: { totalAmountMinor: 180_000, currency: 'KRW', asOfExpenseVersion: 1 },
    likedByMe: false,
    likeCount: 12,
    version: 1,
    members: [user('u1', '하늘'), user('u2', '가람'), user('u3', '나래')],
  };
}
