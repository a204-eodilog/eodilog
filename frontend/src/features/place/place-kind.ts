import type { IconName } from '@/components/ui';
import { colors } from '@/theme';

/** 장소 종류. 카드에 사진이 없을 때 어떤 곳인지 아이콘으로 알린다 */
export type PlaceKind = 'cafe' | 'food' | 'stay' | 'culture' | 'nature' | 'shop' | 'place';

/**
 * 종류를 가르는 낱말. 위에서부터 먼저 맞는 것을 쓴다.
 * 서버의 장소 응답에는 분류가 없어(이름·주소·좌표뿐) 이름에 든 낱말로 짐작한다. 서버가 분류를 주면 그것을 쓰고 이 표는 지운다.
 * 한 글자 낱말(산·섬·궁…)은 다른 이름에 섞여 들기 쉬워 이름 끝에 올 때만 본다
 */
const RULES: [PlaceKind, RegExp][] = [
  [
    'cafe',
    /카페|커피|coffee|cafe|베이커리|빵집|제과|디저트|로스터|찻집|다방|티하우스|도넛|케이크|스타벅스|투썸|이디야/i,
  ],
  [
    'stay',
    /호텔|모텔|리조트|펜션|게스트하우스|민박|스테이|호스텔|콘도|풀빌라|글램핑|캠핑장|한옥스테이/,
  ],
  [
    'culture',
    /박물관|미술관|갤러리|전시관|기념관|문화|유적|한옥마을|성당|사찰|타워|극장|공연장|[가-힣]{1,}(궁|사)$/,
  ],
  [
    'nature',
    /해변|해수욕장|공원|폭포|계곡|수목원|휴양림|호수|바다|전망대|오름|해안|둘레길|일출봉|정원|[가-힣]{2,}(산|섬|봉)$/,
  ],
  ['shop', /시장|마트|백화점|아울렛|아웃렛|쇼핑|상가|면세점|편의점|소품샵|[가-힣]{2,}몰$/],
  [
    'food',
    /식당|맛집|족발|보쌈|국밥|갈비|고기|치킨|피자|버거|초밥|스시|라멘|국수|냉면|횟집|분식|김밥|떡볶이|한우|삼겹|곱창|반점|포차|주점|술집|호프|면옥|가든|뷔페|레스토랑|키친|다이닝|비스트로|파스타|돈까스|만두|순대|해장|곰탕|설렁탕|짬뽕|마라|샤브|구이|닭갈비|장어|수산|횟|식육|밥상|[가-힣]{1,}(탕|찜|집)$/,
  ],
];

/**
 * 지도 공급자의 분류 글에서 종류를 가르는 낱말. 예: "음식점>중식", "카페,디저트>카페", "여행,명소>해수욕장", "숙박>호텔".
 * 가게 이름과 달리 분류는 종류를 그대로 말해 주므로 정확하다
 */
const CATEGORY_RULES: [PlaceKind, RegExp][] = [
  ['cafe', /카페|디저트|베이커리|제과|커피/],
  ['food', /음식점|한식|중식|일식|양식|분식|술집|뷔페|식당|요리|고기|해물|생선|치킨|패스트푸드/],
  ['stay', /숙박|호텔|모텔|펜션|리조트|게스트하우스|민박|캠핑|야영/],
  ['culture', /박물관|미술관|문화|유적|전시|공연|사찰|궁궐|기념관|종교/],
  ['nature', /명소|해수욕장|해변|공원|자연|폭포|계곡|산|섬|수목원|휴양림|호수|전망대/],
  ['shop', /쇼핑|시장|마트|백화점|아울렛|편의점|상가/],
];

/** 분류 글로 본 종류. 맞는 낱말이 없으면 null */
export function kindFromCategory(category: string | null | undefined): PlaceKind | null {
  const text = (category ?? '').trim();
  if (!text) return null;
  for (const [kind, pattern] of CATEGORY_RULES) {
    if (pattern.test(text)) return kind;
  }
  return null;
}

/**
 * 장소 종류. 서버가 분류를 주면 그것으로 정하고, 없거나 알 수 없으면 이름에 든 낱말로 짐작한다.
 * 이름에도 단서가 없으면 'place'.
 * 이름만으로는 "호우섬" 같은 가게가 음식점인지 알 수 없다(2026-11-14 사용자 지적). 서버는 분류를 저장해 두고 있지만
 * 장소 응답에 싣지 않아서(2026-11-14 서버 코드 확인), 응답에 category가 실리면 그때부터 맞게 나온다
 */
export function placeKind(name: string, category?: string | null): PlaceKind {
  const byCategory = kindFromCategory(category);
  if (byCategory) return byCategory;
  const text = name.trim();
  for (const [kind, pattern] of RULES) {
    if (pattern.test(text)) return kind;
  }
  return 'place';
}

/** 종류의 모습: 아이콘, 이름(화면 읽어 주기·카드 글), 아이콘 색과 아이콘 칸 바탕색 */
export type PlaceKindLook = { icon: IconName; label: string; color: string; bg: string };

// 종류마다 색을 달리해 목록에서 한눈에 가려진다. 색은 모두 테마 토큰이다
const LOOK: Record<PlaceKind, PlaceKindLook> = {
  cafe: { icon: 'coffee', label: '카페', color: colors.brand.accent, bg: colors.status.dangerBg },
  food: {
    icon: 'utensils',
    label: '음식점',
    color: colors.status.warning,
    bg: colors.status.warningBg2,
  },
  stay: { icon: 'bed', label: '숙소', color: colors.brand.ai, bg: colors.brand.aiBg },
  culture: { icon: 'landmark', label: '문화', color: colors.text.icon, bg: colors.surface.default },
  nature: {
    icon: 'mountain',
    label: '자연',
    color: colors.status.success,
    bg: colors.status.successBg2,
  },
  shop: {
    icon: 'bag',
    label: '쇼핑',
    color: colors.brand.primaryDark,
    bg: colors.brand.primaryTint,
  },
  place: {
    icon: 'map-pin',
    label: '장소',
    color: colors.brand.primary,
    bg: colors.brand.primaryBg,
  },
};

/** 장소 종류의 모습. 분류가 있으면 분류로, 없으면 이름으로 정한다 */
export function placeKindLook(name: string, category?: string | null): PlaceKindLook {
  return LOOK[placeKind(name, category)];
}
