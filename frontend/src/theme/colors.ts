/**
 * 색상 토큰. Figma 어디로그(파랑) 페이지의 변수 모음 '어디로그 색'과 이름·값을 맞춘다.
 * 컴포넌트에서는 값을 직접 쓰지 말고 이 토큰을 쓴다.
 */
export const colors = {
  brand: {
    primary: '#2A72E5',
    primaryDark: '#1F5BC2',
    primaryLight: '#C6E6FF',
    primarySoft: '#8DCDFF',
    primaryBg: '#EAF2FD',
    ai: '#5B3FD6',
    aiBg: '#EEEAFF',
    accent: '#FF7A59',
  },
  text: {
    default: '#1F2430',
    strong: '#2E3440',
    icon: '#4A5260',
    sub: '#5B6472',
    sub2: '#6B7480',
    muted: '#8A93A0',
    inverse: '#FFFFFF',
  },
  gray: {
    400: '#B4BBC5',
    300: '#C9CED6',
    200: '#D9DEE5',
  },
  line: {
    strong: '#E1E5EB',
    default: '#E6EAF0',
  },
  surface: {
    default: '#F4F6F9',
    subtle: '#F7F8FA',
    white: '#FFFFFF',
  },
  status: {
    success: '#0E7A55',
    successMid: '#7ED3B2',
    successBg: '#DDF4EA',
    successBg2: '#EEF9F3',
    warning: '#9A6A00',
    warningBg: '#FFEAB0',
    warningBg2: '#FFF6E0',
    danger: '#C22F35',
    dangerMid: '#E5484D',
    dangerBg: '#FDECEC',
  },
  /** 동행 얼굴(아바타) 배경. 사람마다 돌아가며 쓴다. */
  friend: {
    sky: '#6FB8F0',
    mint: '#7ED3B2',
    lavender: '#A99BFF',
    apricot: '#FFC46B',
    pink: '#FF9BC4',
    coral: '#FF9F8A',
  },
  /** 홈·마이페이지 지도. step은 많이 간 정도(1이 가장 옅음). */
  map: {
    sea: '#EEF0EC',
    seaGlow: '#F2F3F0',
    regionLine: '#EFF1EE',
    label: '#9AA2AD',
    labelSea: '#A9B0BA',
    step1: '#E3EEFF',
    step1Line: '#A9C6F5',
    step2: '#BBD5FB',
    step3: '#7FAEF3',
    step3Line: '#4D88E6',
    step4: '#2A72E5',
  },
  external: {
    kakao: '#FEE500',
    naver: '#03C75A',
    black: '#000000',
  },
  /** 하단 시트·확인창 뒤 어두운 막 */
  overlay: 'rgba(0, 0, 0, 0.32)',
  /** 파랑 블록 위 반투명 흰색(피그마 S15·S17). 칩 바탕 18%, 보조 글자 85% */
  onBrand: {
    chip: 'rgba(255, 255, 255, 0.18)',
    textSoft: 'rgba(255, 255, 255, 0.85)',
  },
} as const;

export type Colors = typeof colors;
