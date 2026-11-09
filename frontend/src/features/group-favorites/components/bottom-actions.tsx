import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { colors, layout, radius, spacing, typography } from '@/theme';

type Props =
  | {
      mode: 'normal';
      onAdd(): void;
      onPoll(): void;
      onRecommend(): void;
      /** 장소가 없으면 투표 열기를 흐리게 */
      pollDisabled: boolean;
    }
  | { mode: 'selecting'; count: number; onCancel(): void; onConfirm(): void };

/** 아래 버튼 줄(Figma 201-9344): [+]·[투표 열기]·[추천 받기]. 후보 고르기 모드면 [취소]·[N곳으로 투표 열기] */
export function BottomActions(props: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing[16]) }]}>
      {props.mode === 'normal' ? (
        <>
          <Pressable
            style={styles.add}
            onPress={props.onAdd}
            accessibilityRole="button"
            accessibilityLabel="장소 추가"
          >
            <Icon name="plus" size={22} color={colors.text.default} />
          </Pressable>
          <Pressable
            style={[styles.pill, styles.secondary, props.pollDisabled && styles.off]}
            onPress={props.onPoll}
            disabled={props.pollDisabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: props.pollDisabled }}
          >
            <Text style={[typography.bodyBold, styles.secondaryText]}>투표 열기</Text>
          </Pressable>
          <Pressable
            style={[styles.pill, styles.primary]}
            onPress={props.onRecommend}
            accessibilityRole="button"
          >
            <Icon name="bulb" size={18} color={colors.text.inverse} />
            <Text style={[typography.bodyBold, styles.primaryText]}>추천 받기</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Pressable
            style={[styles.pill, styles.cancel]}
            onPress={props.onCancel}
            accessibilityRole="button"
          >
            <Text style={[typography.bodyMedium, styles.cancelText]} numberOfLines={1}>
              취소
            </Text>
          </Pressable>
          <Pressable
            style={[styles.pill, styles.primary, props.count === 0 && styles.off]}
            onPress={props.onConfirm}
            disabled={props.count === 0}
            accessibilityRole="button"
            accessibilityState={{ disabled: props.count === 0 }}
          >
            <Text style={[typography.bodyBold, styles.primaryText]}>
              {props.count > 0 ? `${props.count}곳으로 투표 열기` : '후보를 골라 주세요'}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: spacing[10],
    paddingTop: spacing[12],
    paddingHorizontal: layout.screenPaddingX,
    backgroundColor: colors.surface.white,
    borderTopWidth: 1,
    borderTopColor: colors.line.default,
  },
  add: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[6],
    height: 56,
    borderRadius: radius.lg,
  },
  secondary: { backgroundColor: colors.brand.primaryBg },
  secondaryText: { color: colors.brand.primary },
  primary: { backgroundColor: colors.brand.primary },
  primaryText: { color: colors.text.inverse },
  // 옆 버튼이 길어져도 줄어들지 않게 둔다. 웹에서 flex 0만으로는 두 줄로 접혔다
  cancel: {
    flex: 0,
    flexShrink: 0,
    minWidth: 88,
    paddingHorizontal: spacing[20],
    backgroundColor: colors.surface.default,
  },
  cancelText: { color: colors.text.default },
  off: { opacity: 0.4 },
});
