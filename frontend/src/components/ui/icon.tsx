import Svg, { Circle, Path } from 'react-native-svg';

import { colors, size } from '@/theme';

/** 앱 공통 선 아이콘. 24 기준 좌표를 쓰고 크기만 바꾼다. */
export type IconName =
  | 'back'
  | 'close'
  | 'plus'
  | 'check'
  | 'check-all'
  | 'chevron-right'
  | 'chevron-down'
  | 'chevron-up'
  | 'search'
  | 'home'
  | 'trip'
  | 'bookmark'
  | 'bookmark-plus'
  | 'chat'
  | 'person'
  | 'people'
  | 'bell'
  | 'map-pin'
  | 'calendar'
  | 'link'
  | 'copy'
  | 'alert'
  | 'info'
  | 'clock'
  | 'refresh'
  | 'card'
  | 'calculator'
  | 'star'
  | 'trash'
  | 'camera'
  | 'lock'
  | 'leave'
  | 'image'
  | 'arrow-right'
  | 'map'
  | 'bulb'
  | 'upload'
  | 'globe'
  | 'settings'
  | 'route'
  | 'pencil'
  | 'gear'
  | 'person-plus'
  | 'person-minus'
  | 'crown'
  | 'trending'
  | 'heart'
  | 'moon'
  | 'walk'
  | 'car'
  | 'bus'
  | 'eye'
  | 'clipboard'
  | 'list'
  | 'send'
  | 'eye-off'
  | 'wifi-off'
  | 'more'
  | 'arrow-up'
  | 'arrow-down'
  | 'sun'
  | 'cloud'
  | 'cloud-rain'
  | 'cloud-off'
  | 'umbrella'
  | 'bag'
  | 'zap';

type IconProps = {
  name: IconName;
  /** 지름. 기본 size.icon.lg(24) */
  size?: number;
  color?: string;
  /** 하단 탭처럼 채운 모양이 필요할 때 */
  filled?: boolean;
};

const PATHS: Record<IconName, string> = {
  // 집게판. 붙여넣기(S11). 복사 아이콘은 복사로 읽혀 따로 둔다
  clipboard:
    'M9 5H7A1 1 0 0 0 6 6V20A1 1 0 0 0 7 21H17A1 1 0 0 0 18 20V6A1 1 0 0 0 17 5H15M9 3.5H15V6.5H9V3.5Z',
  back: 'M15 5L8 12L15 19',
  close: 'M6 6L18 18M18 6L6 18',
  plus: 'M12 5V19M5 12H19',
  check: 'M5 12.5L9.5 17L19 7',
  // 겹친 체크. 알림 모두 읽음(S49)
  'check-all': 'M2 12.5L6.5 17L15 8M11 16L12 17L21.5 7',
  'chevron-right': 'M9 5L16 12L9 19',
  // 펼치기·접기(S15 다음 계획 더 보기)
  'chevron-down': 'M5 9L12 16L19 9',
  'chevron-up': 'M5 15L12 8L19 15',
  search: 'M20 20L16.5 16.5M18 10.5A7.5 7.5 0 1 1 3 10.5A7.5 7.5 0 0 1 18 10.5Z',
  home: 'M4 10.5L12 4L20 10.5V19A1 1 0 0 1 19 20H15V14H9V20H5A1 1 0 0 1 4 19V10.5Z',
  trip: 'M4 8H20V19A1 1 0 0 1 19 20H5A1 1 0 0 1 4 19V8Z',
  bookmark: 'M6 4H18V20L12 15.5L6 20V4Z',
  // 저장 탭 북마크 윤곽 오른쪽 위에 작은 +. 저장 탭 머리의 장소 추가(S10)
  'bookmark-plus': 'M12 4H5V20L9.5 16L14 20V10M18 3V9M15 6H21',
  chat: 'M4 6A2 2 0 0 1 6 4H18A2 2 0 0 1 20 6V15A2 2 0 0 1 18 17H9L4 21V6Z',
  person: 'M12 12A4 4 0 1 0 12 4A4 4 0 0 0 12 12ZM4 20C4 16.7 7.6 15 12 15C16.4 15 20 16.7 20 20',
  people:
    'M9 11A3.5 3.5 0 1 0 9 4A3.5 3.5 0 0 0 9 11ZM2 19C2 15.9 5.1 14 9 14C12.9 14 16 15.9 16 19M16 11A3 3 0 1 0 16 5M18 14.3C20.4 14.9 22 16.4 22 19',
  bell: 'M6 16V11A6 6 0 0 1 18 11V16L19.5 18H4.5L6 16ZM10 21H14',
  'map-pin':
    'M12 21C12 21 5 14.5 5 10A7 7 0 0 1 19 10C19 14.5 12 21 12 21ZM12 12.5A2.5 2.5 0 1 0 12 7.5A2.5 2.5 0 0 0 12 12.5Z',
  calendar: 'M4 6H20V20H4V6ZM4 10H20M8 4V8M16 4V8',
  link: 'M10 14L14 10M13 7L15 5A3.5 3.5 0 0 1 19 10L17 12M11 17L9 19A3.5 3.5 0 0 1 5 14L7 12',
  copy: 'M9 9H19V19H9V9ZM5 15V5H15',
  alert: 'M12 3L22 20H2L12 3ZM12 10V14M12 17V17.5',
  info: 'M21 12A9 9 0 1 1 3 12A9 9 0 0 1 21 12ZM12 7.5V12.5M12 16V16.01',
  clock: 'M20.5 12A8.5 8.5 0 1 1 3.5 12A8.5 8.5 0 0 1 20.5 12ZM12 7.5V12L15 14',
  refresh: 'M20 12A8 8 0 1 1 17.66 6.34M20 4V8.5H15.5',
  card: 'M5 6.5H19A1.5 1.5 0 0 1 20.5 8V16A1.5 1.5 0 0 1 19 17.5H5A1.5 1.5 0 0 1 3.5 16V8A1.5 1.5 0 0 1 5 6.5ZM3.5 10H20.5M16 14.5H16.01',
  calculator:
    'M7 3.5H17A2 2 0 0 1 19 5.5V18.5A2 2 0 0 1 17 20.5H7A2 2 0 0 1 5 18.5V5.5A2 2 0 0 1 7 3.5ZM8.5 7.5H15.5M8.5 12H8.51M12 12H12.01M15.5 12H15.51M8.5 15.5H8.51M12 15.5H12.01M15.5 15.5H15.51',
  star: 'M12 3.5L14.6 8.8L20.4 9.6L16.2 13.7L17.2 19.5L12 16.8L6.8 19.5L7.8 13.7L3.6 9.6L9.4 8.8L12 3.5Z',
  trash: 'M4 7H20M9 7V4H15V7M6 7L7 20H17L18 7M10 11V16M14 11V16',
  camera:
    'M4 8.5A1.5 1.5 0 0 1 5.5 7H8L9.5 4.5H14.5L16 7H18.5A1.5 1.5 0 0 1 20 8.5V17.5A1.5 1.5 0 0 1 18.5 19H5.5A1.5 1.5 0 0 1 4 17.5V8.5ZM12 16A3.5 3.5 0 1 0 12 9A3.5 3.5 0 0 0 12 16Z',
  lock: 'M6 11H18V20H6V11ZM8 11V8A4 4 0 0 1 16 8V11M12 14.5V16.5',
  leave: 'M14 4H18A2 2 0 0 1 20 6V18A2 2 0 0 1 18 20H14M9 8L5 12L9 16M5 12H15',
  image: 'M4 5H20V19H4V5ZM4 16L9 11L14 16M13 15L16 12L20 16M15.5 8.5V8.6',
  'arrow-right': 'M5 12H19M13 6L19 12L13 18',
  map: 'M9 4.5L3.5 6.5V19.5L9 17.5L15 19.5L20.5 17.5V4.5L15 6.5L9 4.5ZM9 4.5V17.5M15 6.5V19.5',
  bulb: 'M9.5 18.5H14.5M10.5 21H13.5M12 3A6 6 0 0 0 8.5 13.9V16H15.5V13.9A6 6 0 0 0 12 3Z',
  upload: 'M12 15V4M7 9L12 4L17 9M5 15V19A1 1 0 0 0 6 20H18A1 1 0 0 0 19 19V15',
  globe:
    'M21 12A9 9 0 1 1 3 12A9 9 0 0 1 21 12ZM3.5 9H20.5M3.5 15H20.5M12 3C14.3 5.5 15.5 8.6 15.5 12C15.5 15.4 14.3 18.5 12 21C9.7 18.5 8.5 15.4 8.5 12C8.5 8.6 9.7 5.5 12 3Z',
  // 내 노출 설정(S38). 톱니 대신 조절 막대 모양
  settings:
    'M4 7H13M17 7H20M4 17H7M11 17H20M15 9A2 2 0 1 0 15 5A2 2 0 0 0 15 9ZM9 19A2 2 0 1 0 9 15A2 2 0 0 0 9 19Z',
  // 양 끝 동그라미를 S자 길로 잇는 경로. S33 '계획에만 있어요'
  route:
    'M6 21A2 2 0 1 0 6 17A2 2 0 0 0 6 21ZM18 7A2 2 0 1 0 18 3A2 2 0 0 0 18 7ZM8 19H16.5A3.5 3.5 0 0 0 16.5 12H7.5A3.5 3.5 0 0 1 7.5 5H16',
  // S34 내 평가 [수정]
  pencil: 'M4 20H8L18.5 9.5A2.1 2.1 0 0 0 15.5 6.5L5 17V20M13.5 8.5L16.5 11.5',
  // 여행 설정(피그마 S17 오른쪽 위). 가운데 원과 바퀴살. dev의 settings(조절 막대, S38)와 겹치지 않게 gear로 둔다
  gear: 'M12 15A3 3 0 1 0 12 9A3 3 0 0 0 12 15ZM12 3V5M12 19V21M3 12H5M19 12H21M5.6 5.6L7 7M17 17L18.4 18.4M5.6 18.4L7 17M17 7L18.4 5.6',
  // 동행 초대(피그마 S17 동행 줄 오른쪽). 사람 + 더하기
  'person-plus':
    'M10 12A4 4 0 1 0 10 4A4 4 0 0 0 10 12ZM3 20C3 16.7 6.2 15 10 15C11.4 15 12.7 15.2 13.8 15.7M18 14V20M15 17H21',
  // 동행 내보내기(S19 방장 메뉴). 사람 + 빼기
  'person-minus':
    'M10 12A4 4 0 1 0 10 4A4 4 0 0 0 10 12ZM3 20C3 16.7 6.2 15 10 15C11.4 15 12.7 15.2 13.8 15.7M15 17H21',
  // 방장 넘기기(S19 방장 메뉴). 왕관
  crown: 'M4 8L8 12L12 5L16 12L20 8L18.5 18H5.5L4 8Z',
  trending: 'M3 17L9 11L13 15L21 7M15 7H21V13',
  heart: 'M12 20S4 14.6 4 9.2A4.2 4.2 0 0 1 12 7A4.2 4.2 0 0 1 20 9.2C20 14.6 12 20 12 20Z',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4A6.5 6.5 0 0 0 20 14.5Z',
  // S07 장소 사이 이동 수단
  walk: 'M13 5.5A1.5 1.5 0 1 0 13 2.5A1.5 1.5 0 0 0 13 5.5ZM10 21L12 15L14.5 17V21M8 11L10.5 8H14L16 12L18 13M10.5 8L9.5 13L12 15',
  car: 'M5 16V12L7 7H17L19 12V16H5ZM5 16V18M19 16V18M5 12H19M8 14H8.5M15.5 14H16',
  bus: 'M6 4H18A1 1 0 0 1 19 5V17H5V5A1 1 0 0 1 6 4ZM5 11H19M8 17V19M16 17V19M8 14H8.5M15.5 14H16',
  // S37 친구에게 보이는 모습
  eye: 'M2.5 12C4.5 7.8 8 5.5 12 5.5C16 5.5 19.5 7.8 21.5 12C19.5 16.2 16 18.5 12 18.5C8 18.5 4.5 16.2 2.5 12ZM12 15A3 3 0 1 0 12 9A3 3 0 0 0 12 15Z',
  // S39 저장(보내기)
  send: 'M20 4L10 14M20 4L14 20L10 14L4 10L20 4Z',
  // S44 추천 숨기기
  'eye-off':
    'M3 3L21 21M10.6 6A9.6 9.6 0 0 1 12 5.5C16 5.5 19.5 7.8 21.5 12A11.6 11.6 0 0 1 18.4 16M14.1 14.2A3 3 0 0 1 9.8 9.9M6.3 7.6A11.8 11.8 0 0 0 2.5 12C4.5 16.2 8 18.5 12 18.5C13.6 18.5 15.1 18.1 16.4 17.5',
  // S10 목록 보기. 점 세 개 + 줄 세 개
  list: 'M9 6H20M9 12H20M9 18H20M4.5 6H4.51M4.5 12H4.51M4.5 18H4.51',
  /** 위·아래 화살표. 코스 장소 순서 바꾸기 */
  'arrow-up': 'M12 19V5M5 12L12 5L19 12',
  'arrow-down': 'M12 5V19M19 12L12 19L5 12',
  /** 가로 점 세 개. 줄 오른쪽 더보기 버튼(준비물 고치기) */
  more: 'M5 12A1 1 0 1 0 7 12A1 1 0 1 0 5 12M11 12A1 1 0 1 0 13 12A1 1 0 1 0 11 12M17 12A1 1 0 1 0 19 12A1 1 0 1 0 17 12',
  // S10 연결 끊김. 와이파이 부채꼴 + 사선
  'wifi-off':
    'M3 3L21 21M8.5 16.2A5 5 0 0 1 14 15.5M5 12.6A10 10 0 0 1 9.3 10.2M19 12.6A10 10 0 0 0 15.5 10.4M1.8 9A15 15 0 0 1 6 6.3M22.2 9A15 15 0 0 0 10.8 5M12 20H12.01',
  /** S25·S26 날씨. 해, 구름, 비구름, 갱신 실패(구름 + 사선) */
  sun: 'M12 16A4 4 0 1 0 12 8A4 4 0 1 0 12 16M12 2V4M12 20V22M4.9 4.9L6.3 6.3M17.7 17.7L19.1 19.1M2 12H4M20 12H22M4.9 19.1L6.3 17.7M17.7 6.3L19.1 4.9',
  cloud: 'M17.5 19H7A5 5 0 1 1 8.2 9.1A6 6 0 0 1 19.6 11.1A4 4 0 0 1 17.5 19Z',
  'cloud-rain':
    'M17.5 15H7A5 5 0 1 1 8.2 5.1A6 6 0 0 1 19.6 7.1A4 4 0 0 1 17.5 15ZM8 18L7 21M12 18L11 21M16 18L15 21',
  'cloud-off':
    'M3 3L21 21M9.4 5.4A6 6 0 0 1 19.6 9.1A4 4 0 0 1 20.4 16.3M17 19H7A5 5 0 0 1 5.9 9.1',
  /** S25 날씨 대안 칸, S26 대안 없음 */
  umbrella: 'M12 2V3M3 12A9 9 0 0 1 21 12ZM12 12V19A2 2 0 0 1 8 19',
  /** S25 준비물 칸 */
  bag: 'M6 7H18L19 21H5L6 7ZM9 10V6A3 3 0 0 1 15 6V10',
  /** S25 주변 편의시설 칸 */
  zap: 'M13 2L4 14H12L11 22L20 10H12L13 2Z',
};

/** 채워도 선으로만 남겨야 하는 부분. 가방 손잡이처럼 몸통과 따로 그린다. */
const OUTLINE_ONLY: Partial<Record<IconName, string>> = {
  trip: 'M9 8V5A1 1 0 0 1 10 4H14A1 1 0 0 1 15 5V8',
};

export function Icon({
  name,
  size: dim = size.icon.lg,
  color = colors.text.icon,
  filled = false,
}: IconProps) {
  const path = PATHS[name];
  const outline = OUTLINE_ONLY[name];
  return (
    <Svg width={dim} height={dim} viewBox="0 0 24 24" fill="none">
      <Path
        d={path}
        stroke={color}
        strokeWidth={filled ? 1.5 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
      />
      {outline ? (
        <Path
          d={outline}
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </Svg>
  );
}

type DotProps = { color?: string; size?: number };

/** 새 소식 점. 아이콘 오른쪽 위에 겹쳐 쓴다. */
export function Dot({ color = colors.status.dangerMid, size: dim = 8 }: DotProps) {
  return (
    <Svg width={dim} height={dim} viewBox="0 0 8 8">
      <Circle cx={4} cy={4} r={4} fill={color} />
    </Svg>
  );
}
