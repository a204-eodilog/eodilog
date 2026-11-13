import { Image } from 'expo-image';

/**
 * 걷는 여행자 마스코트. Figma S05 '첫 방문(여행 없음)' 화면에 넣은 것과 같은 모션이다.
 * 36장 걷기 프레임을 GIF로 묶었고(한 바퀴 약 4.9초), expo-image가 움직임을 재생한다.
 */
export function MascotTraveler({ size = 200 }: { size?: number }) {
  return (
    <Image
      source={require('@/assets/mascot/traveler-walk.gif')}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessibilityLabel="가방을 끌고 걷는 여행자"
    />
  );
}

/**
 * 영수증을 보며 계산기를 두드리는 여행자. 말로 경비 입력(N10) 분석 중 화면에 쓴다.
 * 걷는 여행자와 같은 캐릭터·같은 형식(400×400, 36장, 장당 140ms, 한 바퀴 약 5초)이다
 */
export function MascotCalculating({ size = 200 }: { size?: number }) {
  return (
    <Image
      source={require('@/assets/mascot/expense-calc.gif')}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessibilityLabel="영수증을 보며 계산기를 두드리는 여행자"
    />
  );
}
