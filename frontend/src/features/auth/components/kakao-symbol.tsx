import Svg, { Path } from 'react-native-svg';

import { colors, size } from '@/theme';

/** 카카오 버튼의 말풍선. Figma S01 '카카오로 계속하기' 아이콘 그대로 */
export function KakaoSymbol({ size: dim = size.icon.lg }: { size?: number }) {
  return (
    <Svg width={dim} height={dim} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 11.5C19.9958 12.8096 19.6488 14.0953 18.9935 15.2292C18.3382 16.3631 17.3974 17.3056 16.2647 17.9629C15.132 18.6203 13.8469 18.9696 12.5373 18.9761C11.2277 18.9826 9.93917 18.6461 8.8 18L4 19.5L5.5 15.2C5.17797 14.2234 5.06019 13.1911 5.15398 12.1671C5.24778 11.1431 5.55114 10.1493 6.04521 9.24754C6.53929 8.34573 7.21353 7.55516 8.02605 6.92494C8.83856 6.29472 9.77199 5.83831 10.7683 5.58406C11.7647 5.32982 12.8027 5.28318 13.8178 5.44703C14.833 5.61089 15.8036 5.98174 16.6693 6.53655C17.5351 7.09136 18.2775 7.81828 18.8505 8.67213C19.4235 9.52599 19.8147 10.4885 20 11.5Z"
        fill={colors.text.default}
        stroke={colors.text.default}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
