import { forwardRef, type ReactNode } from 'react';
import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Icon } from '@/components/ui';
import { colors, spacing, typography } from '@/theme';

/**
 * 웹에서는 네이티브 지도가 없다. 화면 틀만 확인할 수 있게 같은 자리에 회색 상자를 그린다.
 * 타입 검사는 map-view.tsx(네이티브) 기준이라 다른 지도 속성은 여기서 받지 않고 버린다
 */
export type MapViewProps = {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};
export type MapViewRef = Record<string, never>;

export const MapView = forwardRef<MapViewRef, MapViewProps>(function MapView({ style }, _ref) {
  return (
    <View style={[styles.box, style]} accessibilityLabel="지도는 앱에서 보여요">
      <Icon name="map" size={24} color={colors.map.label} />
      <Text style={[typography.caption, styles.text]}>지도는 앱에서 보여요</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  box: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[6],
    backgroundColor: colors.map.sea,
  },
  text: { color: colors.map.label },
});
