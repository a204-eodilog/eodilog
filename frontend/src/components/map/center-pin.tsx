import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors } from '@/theme';

const PIN_W = 44;
const PIN_H = 55;
const SHADOW_GAP = 2;
const SHADOW_H = 4;
/** 핀 끝의 높이(그림 위에서부터). Figma 그림 58.625 - 위 여백 5 */
const TIP_Y = 53.625;
/** 핀 끝을 가운데에 맞추려면 핀+그림자 묶음을 이만큼 위로 올린다 */
const LIFT = TIP_Y - (PIN_H + SHADOW_GAP + SHADOW_H) / 2;

/**
 * 지도 가운데 고정 핀(S13 지도에서 고르기). 지도를 움직여 핀 끝에 위치를 맞춘다.
 * 지도 위에 겹쳐 놓는 화면 부품이라 지도를 덮는 부모(position: relative) 안에 넣으면
 * 핀 끝이 정확히 부모의 가운데에 온다. 누를 수 없다.
 */
export function CenterPin() {
  return (
    <View pointerEvents="none" style={styles.layer}>
      <View style={styles.pin}>
        <Svg width={PIN_W} height={PIN_H} viewBox="6 5 44 55">
          <Path
            d="M28 58.625C28 58.625 8.75 42.125 8.75 27C8.75 21.8946 10.7781 16.9983 14.3882 13.3882C17.9983 9.77812 22.8946 7.75 28 7.75C33.1054 7.75 38.0017 9.77812 41.6118 13.3882C45.2219 16.9983 47.25 21.8946 47.25 27C47.25 42.125 28 58.625 28 58.625Z"
            fill={colors.text.default}
          />
          <Path
            d="M28 33.875C31.797 33.875 34.875 30.797 34.875 27C34.875 23.203 31.797 20.125 28 20.125C24.203 20.125 21.125 23.203 21.125 27C21.125 30.797 24.203 33.875 28 33.875Z"
            fill={colors.text.inverse}
          />
        </Svg>
        <View style={styles.shadow} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  // 핀 끝이 가운데에 오도록 핀 전체를 위로 올린다
  pin: { alignItems: 'center', gap: SHADOW_GAP, transform: [{ translateY: -LIFT }] },
  shadow: {
    width: 8,
    height: SHADOW_H,
    borderRadius: 2.8,
    backgroundColor: colors.external.black,
    opacity: 0.25,
  },
});
