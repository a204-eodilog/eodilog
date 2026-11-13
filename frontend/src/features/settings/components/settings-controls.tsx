import { ReactNode, useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Switch, Text, View } from 'react-native';

import { Card, Icon, type IconName } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, layout, radius, size, spacing, typography } from '@/theme';

export function SettingsSection({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.headingText}>
          {title}
        </Text>
        {note ? <Text style={styles.caption}>{note}</Text> : null}
      </View>
      <Card variant="filled" rounded="xl" style={styles.card}>
        {children}
      </Card>
    </View>
  );
}

export function SettingsRow({
  icon,
  label,
  description,
  value,
  onPress,
  disabled = false,
  danger = false,
  trailing,
}: {
  icon: IconName;
  label: string;
  description?: string;
  value?: string;
  onPress?: () => void;
  disabled?: boolean;
  danger?: boolean;
  trailing?: ReactNode;
}) {
  const content = (
    <>
      <Icon
        name={icon}
        size={size.icon.md}
        color={danger ? colors.status.danger : colors.text.icon}
      />
      <View style={styles.rowText}>
        <Text style={[styles.label, danger && styles.danger]}>{label}</Text>
        {description ? <Text style={styles.caption}>{description}</Text> : null}
      </View>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {trailing ??
        (onPress ? (
          <Icon name="chevron-right" size={size.icon.sm} color={colors.gray[400]} />
        ) : null)}
    </>
  );
  return onPress ? (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={[label, value, description].filter(Boolean).join(', ')}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {content}
    </PressableScale>
  ) : (
    <View style={styles.row}>{content}</View>
  );
}

export function SettingsToggle({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggle}>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: colors.gray[300], true: colors.brand.primary }}
        thumbColor={colors.surface.white}
        {...(Platform.OS === 'web' ? { activeThumbColor: colors.surface.white } : {})}
        ios_backgroundColor={colors.gray[300]}
      />
    </View>
  );
}

export function AiModeSelector<T extends string>({
  label,
  description,
  icon,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  icon: IconName;
  value: T;
  options: readonly { value: T; label: string; disabled?: boolean }[];
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  // 고른 칸 뒤의 흰 바탕. 다른 칸을 고르면 그쪽으로 미끄러진다(글자는 제자리)
  const [width, setWidth] = useState(0);
  const index = options.findIndex((o) => o.value === value);
  const slide = useState(() => new Animated.Value(Math.max(index, 0)))[0];
  useEffect(() => {
    if (index < 0) return;
    Animated.timing(slide, {
      toValue: index,
      duration: 240,
      easing: Easing.bezier(0.165, 0.84, 0.44, 1),
      useNativeDriver: true,
    }).start();
  }, [index, slide]);
  const cell =
    (width - SEGMENT_PAD * 2 - SEGMENT_GAP * (options.length - 1)) / Math.max(options.length, 1);
  return (
    <View style={styles.aiItem}>
      <View style={styles.aiHeading}>
        <Icon name={icon} size={size.icon.md} color={colors.text.icon} />
        <View style={styles.rowText}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.caption}>{description}</Text>
        </View>
      </View>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={styles.segments}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {width > 0 && index >= 0 ? (
          <Animated.View
            style={[
              styles.thumb,
              {
                width: cell,
                transform: [
                  {
                    translateX: slide.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, cell + SEGMENT_GAP],
                    }),
                  },
                ],
              },
            ]}
          />
        ) : null}
        {options.map((option) => (
          <PressableScale
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={label + ', ' + option.label}
            accessibilityState={{
              checked: value === option.value,
              disabled: disabled || option.disabled,
            }}
            disabled={disabled || option.disabled}
            onPress={() => {
              if (value !== option.value) onChange(option.value);
            }}
            style={({ pressed }) => [
              styles.segment,
              option.disabled && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.option, value === option.value && styles.optionSelected]}>
              {option.label}
            </Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const SEGMENT_PAD = spacing[4];
const SEGMENT_GAP = spacing[2];

const styles = StyleSheet.create({
  section: { gap: spacing[10] },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[8],
  },
  headingText: { ...typography.title3, color: colors.text.default },
  card: { paddingHorizontal: spacing[18], paddingVertical: spacing[4], gap: spacing[2] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    minHeight: size.button.lg + spacing[4],
    paddingVertical: spacing[6],
  },
  rowText: { flex: 1 },
  label: { ...typography.bodyMedium, color: colors.text.default },
  value: { ...typography.body, color: colors.text.icon },
  caption: { ...typography.caption, color: colors.text.icon },
  danger: { color: colors.status.danger },
  toggle: { minHeight: layout.minTouchTarget, justifyContent: 'center' },
  aiItem: { paddingVertical: spacing[12], gap: spacing[10] },
  aiHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing[14] },
  segments: {
    flexDirection: 'row',
    gap: SEGMENT_GAP,
    padding: SEGMENT_PAD,
    borderRadius: radius.full,
    backgroundColor: colors.line.default,
  },
  segment: {
    flex: 1,
    minHeight: layout.minTouchTarget,
    paddingHorizontal: spacing[8],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  // 고른 칸 뒤에 깔리는 흰 바탕
  thumb: {
    position: 'absolute',
    top: SEGMENT_PAD,
    bottom: SEGMENT_PAD,
    left: SEGMENT_PAD,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
  },
  option: { ...typography.captionMedium, color: colors.text.icon },
  optionSelected: { color: colors.text.default },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
});
