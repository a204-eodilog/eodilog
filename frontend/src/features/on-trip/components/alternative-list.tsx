import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet, Button, Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { CheckMarkWhen } from '@/components/ui/check-mark';
import { colors, radius, spacing, typography } from '@/theme';

import { alternativeView } from '../on-trip-rules';
import type { Weather, WeatherAlternative } from '../types';

/** S26 비의 영향을 받는 일정(Figma 201-14861). 번호, 시각, 이름, 빨간 안내 */
export function AffectedRow(props: { index: number; time: string | null; name: string }) {
  return (
    <View style={styles.affected}>
      <View style={styles.number}>
        <Text style={[typography.captionBold, styles.numberText]}>{props.index + 1}</Text>
      </View>
      <View style={styles.flex}>
        {props.time ? (
          <Text style={[typography.captionMedium, styles.time]}>{props.time}</Text>
        ) : null}
        {/* 빨간 표시 옆이라 좁아 두 줄까지 쓴다 */}
        <Text style={[typography.bodyBold, styles.title]} numberOfLines={2}>
          {props.name}
        </Text>
      </View>
      {/* 장소에 실내·야외 정보가 없어 디자인의 "야외라서" 대신 시간으로 말한다(Q-10-3) */}
      <View style={styles.warn}>
        <Text style={[typography.captionMedium, styles.warnText]}>비 오는 시간 일정이에요</Text>
      </View>
    </View>
  );
}

/**
 * S26 "대신 이렇게 해 볼까요?" 대안 목록(Figma 201-14861). 하나만 고른다.
 * 안내(INFO)는 고를 수 없어 흐리게 보인다.
 */
export function AlternativeList(props: {
  alternatives: readonly WeatherAlternative[];
  weather: Weather | null;
  selectedId: string | null;
  onSelect(id: string): void;
}) {
  return (
    <View style={styles.list} accessibilityRole="radiogroup">
      {props.alternatives.map((alt) => {
        const view = alternativeView(alt, props.weather);
        const on = props.selectedId === alt.alternativeId;
        return (
          <PressableScale
            key={alt.alternativeId}
            style={[styles.option, on && styles.optionOn, !view.selectable && styles.optionOff]}
            onPress={() => props.onSelect(alt.alternativeId)}
            disabled={!view.selectable}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: !view.selectable }}
            accessibilityLabel={view.title}
          >
            <View style={[styles.radio, on && styles.radioOn]}>
              <CheckMarkWhen checked={on} size={14} />
            </View>
            <View style={styles.flex}>
              <Text style={[typography.bodyBold, styles.title]}>{view.title}</Text>
              <View style={styles.lines}>
                {view.lines.map((l) => (
                  <View key={l.text} style={styles.line}>
                    <Icon name={l.icon} size={16} color={colors.text.icon} />
                    <Text style={[typography.caption, styles.lineText]}>{l.text}</Text>
                  </View>
                ))}
              </View>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

/**
 * S26 코스에 반영한 뒤(Figma 201-15028). 만든 변경안의 이전 → 이후 일정.
 * [변경안 보기]는 S29로 간다(11번, Q-10-6).
 */
export function ProposalSheet(props: {
  visible: boolean;
  /** "1일차 오전 일정" */
  scope: string;
  from: { time: string | null; name: string } | null;
  to: { time: string | null; name: string } | null;
  onClose(): void;
  onView(): void;
}) {
  return (
    <BottomSheet
      visible={props.visible}
      onClose={props.onClose}
      title="변경안을 만들었어요"
      titleVariant="title2"
    >
      <View style={styles.sheet}>
        <View style={styles.line}>
          <Icon name="route" size={16} color={colors.text.icon} />
          <Text style={[typography.caption, styles.lineText]}>{props.scope}</Text>
        </View>
        {props.from && props.to ? (
          <View style={styles.change}>
            <View style={styles.flex}>
              {props.from.time ? (
                <Text style={[typography.caption, styles.time]}>{props.from.time}</Text>
              ) : null}
              <Text style={[typography.body, styles.before]} numberOfLines={1}>
                {props.from.name}
              </Text>
            </View>
            <Icon name="chevron-right" size={18} color={colors.text.muted} />
            <View style={styles.flex}>
              {props.to.time ? (
                <Text style={[typography.caption, styles.time]}>{props.to.time}</Text>
              ) : null}
              <Text style={[typography.bodyBold, styles.title]} numberOfLines={1}>
                {props.to.name}
              </Text>
            </View>
          </View>
        ) : null}
        <View style={styles.note}>
          <Icon name="people" size={16} color={colors.text.icon} />
          <Text style={[typography.caption, styles.lineText]}>
            적용 전까지 지금 코스는 그대로예요
          </Text>
        </View>
        <View style={styles.actions}>
          <PressableScale
            accessibilityLabel="닫기"
            style={styles.close}
            onPress={props.onClose}
            accessibilityRole="button"
          >
            <Icon name="close" size={20} color={colors.text.icon} />
          </PressableScale>
          <Button
            label="변경안 보기"
            icon="zap"
            weight="medium"
            onPress={props.onView}
            style={styles.flex}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

/** S26 대안 없음(Figma 201-15227). 우산·우비를 준비물에 넣을지 묻는다 */
export function NoAlternative(props: { onAdd(): void; busy: boolean; added: boolean }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name="umbrella" size={26} color={colors.text.icon} />
      </View>
      <Text style={[typography.title2, styles.title]}>가까운 실내 대안이 없어요</Text>
      <Text style={[typography.body, styles.emptyBody]}>우산·우비를 준비물에 넣을까요?</Text>
      <Button
        label={props.added ? '준비물에 넣었어요' : '준비물에 넣기'}
        icon="bag"
        onPress={props.onAdd}
        loading={props.busy}
        disabled={props.added}
        style={styles.emptyButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { color: colors.text.default },
  time: { color: colors.text.icon },
  affected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    paddingHorizontal: spacing[16],
    paddingVertical: spacing[12],
    borderRadius: radius.md + 2,
    backgroundColor: colors.surface.white,
  },
  number: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { color: colors.text.inverse },
  warn: {
    height: 24,
    paddingHorizontal: spacing[8],
    borderRadius: radius.sm,
    backgroundColor: colors.status.dangerBg,
    justifyContent: 'center',
  },
  warnText: { color: colors.status.danger },
  list: { gap: spacing[12] },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[18],
    paddingHorizontal: spacing[20],
    paddingVertical: spacing[16],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  optionOn: { backgroundColor: colors.brand.primaryBg },
  optionOff: { opacity: 0.5 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { backgroundColor: colors.brand.primary },
  lines: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing[12], rowGap: spacing[2] },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  lineText: { color: colors.text.icon },
  sheet: { gap: spacing[16] },
  change: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    padding: spacing[16],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  before: { color: colors.text.sub, textDecorationLine: 'line-through' },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    padding: spacing[14],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing[10] },
  close: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.text.icon },
  empty: { alignItems: 'center', gap: spacing[8], paddingVertical: spacing[32] },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[12],
  },
  emptyBody: { color: colors.text.icon },
  emptyButton: { alignSelf: 'center', marginTop: spacing[16] },
});
