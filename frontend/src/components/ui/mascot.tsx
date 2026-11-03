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
