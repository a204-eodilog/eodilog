import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet, Icon, type IconName } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, layout, radius, spacing, typography } from '@/theme';

export type ItemSheetTarget = { name: string; day: number; index: number; count: number };

type Props = {
  /** 고칠 장소. null이면 닫혀 있다 */
  target: ItemSheetTarget | null;
  onClose(): void;
  onReplace(): void;
  onMove(delta: -1 | 1): void;
  onRemove(): void;
};

/** S23 장소 교체·순서 변경·삭제 시트(Figma 201-13071) */
export function ItemSheet({ target, onClose, onReplace, onMove, onRemove }: Props) {
  const first = target ? target.index === 0 : true;
  const last = target ? target.index === target.count - 1 : true;
  return (
    <BottomSheet
      visible={target !== null}
      onClose={onClose}
      title={target?.name}
      titleVariant="title3"
      description={target ? `${target.day + 1}일차 ${target.index + 1}번째` : undefined}
      descriptionVariant="caption"
    >
      <View style={styles.list}>
        <Option
          icon="search"
          title="다른 장소로 바꾸기"
          body="장소 검색에서 골라요"
          onPress={onReplace}
        />
        <View style={[styles.option, styles.neutral]}>
          <View style={styles.iconBox}>
            <Icon name="list" size={20} color={colors.text.icon} />
          </View>
          <View style={styles.texts}>
            <Text style={[typography.bodyMedium, styles.title]}>순서 바꾸기</Text>
            <Text style={[typography.caption, styles.body]}>화살표로 한 칸씩 옮겨요</Text>
          </View>
          <Arrow icon="arrow-up" label="위로" disabled={first} onPress={() => onMove(-1)} />
          <Arrow icon="arrow-down" label="아래로" disabled={last} onPress={() => onMove(1)} />
        </View>
        <Option
          icon="trash"
          title="코스에서 빼기"
          body="그룹 즐겨찾기에는 남아요"
          onPress={onRemove}
          danger
        />
      </View>
    </BottomSheet>
  );
}

function Option(props: {
  icon: IconName;
  title: string;
  body: string;
  onPress(): void;
  danger?: boolean;
}) {
  const color = props.danger ? colors.status.danger : colors.text.icon;
  return (
    <PressableScale
      style={[styles.option, props.danger ? styles.danger : styles.neutral]}
      onPress={props.onPress}
      accessibilityRole="button"
    >
      <View style={styles.iconBox}>
        <Icon name={props.icon} size={20} color={color} />
      </View>
      <View style={styles.texts}>
        <Text style={[typography.bodyMedium, props.danger ? styles.dangerTitle : styles.title]}>
          {props.title}
        </Text>
        <Text style={[typography.caption, styles.body]}>{props.body}</Text>
      </View>
    </PressableScale>
  );
}

function Arrow(props: { icon: IconName; label: string; disabled: boolean; onPress(): void }) {
  return (
    <PressableScale
      style={[styles.arrow, props.disabled && styles.arrowOff]}
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled }}
    >
      <Icon name={props.icon} size={18} color={colors.text.default} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing[10] },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    minHeight: 64,
    paddingHorizontal: spacing[16],
    borderRadius: radius.lg,
  },
  neutral: { backgroundColor: colors.surface.default },
  danger: { backgroundColor: colors.status.dangerBg },
  iconBox: { width: 24, alignItems: 'center' },
  texts: { flex: 1 },
  title: { color: colors.text.default },
  dangerTitle: { color: colors.status.danger },
  body: { color: colors.text.sub },
  arrow: {
    width: layout.minTouchTarget - 4,
    height: layout.minTouchTarget - 4,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowOff: { opacity: 0.4 },
});
