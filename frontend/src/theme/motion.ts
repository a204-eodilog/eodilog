import { Easing, Platform } from 'react-native';

/**
 * 움직임 기준값(2026-11-11 사용자 결정). 화면마다 숫자를 따로 적지 않고 여기서 가져다 쓴다.
 *
 * - 빠르기 3단계: 빠름 120ms(눌림, 글자 바뀜), 보통 200ms(나타남·사라짐), 느림 300ms(크게 움직이는 것)
 * - 버튼 눌림: 0.96배로 줄었다가 스프링으로 돌아온다
 * - 체크 표시: 선이 220ms 동안 처음부터 끝까지 그려진다(ease in out)
 * - 팝업: 0.92배에서 1배로 180ms 동안 커지며 나온다(ease in)
 *
 * 휴대폰의 "동작 줄이기"가 켜져 있으면 움직이지 않고 바로 끝 모양이 된다(hooks/use-reduce-motion)
 */
export const motion = {
  duration: {
    /** 눌림, 글자와 아이콘 바뀜 */
    fast: 120,
    /** 나타남과 사라짐 */
    normal: 200,
    /** 크게 움직이는 것 */
    slow: 300,
  },
  easing: {
    /** 들어올 때. 빨리 출발해 천천히 멈춘다 */
    out: Easing.out(Easing.cubic),
    /** 나갈 때. 천천히 출발해 빨리 사라진다 */
    in: Easing.in(Easing.cubic),
    /** 제자리에서 모양이 바뀔 때 */
    inOut: Easing.inOut(Easing.cubic),
  },
  press: {
    /** 누르는 동안의 크기 */
    scale: 0.96,
    /** 손을 뗐을 때 돌아오는 스프링. 한 번 살짝 넘쳤다 멈춘다 */
    spring: { tension: 300, friction: 16 },
  },
  check: {
    /** 체크 선이 그려지는 시간 */
    duration: 220,
  },
  popup: {
    /** 나타나기 시작할 때의 크기 */
    fromScale: 0.92,
    /** 굼뜨면 이 값만 줄인다 */
    duration: 180,
  },
  /** 고른 탭 아이콘이 통 튀는 크기 */
  tab: { fromScale: 0.86 },
  /**
   * 크기·투명도 움직임을 화면 그리는 쪽에서 돌릴지. 웹은 지원하지 않아 끈다.
   * 색이나 선 길이처럼 지원하지 않는 속성은 늘 false로 쓴다
   */
  native: Platform.OS !== 'web',
} as const;
