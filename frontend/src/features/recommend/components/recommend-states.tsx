import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, radius, spacing, typography } from '@/theme';

/** 가운데 회색 원 아이콘 */
function Badge({ icon }: { icon: IconName }) {
  return (
    <View style={styles.badge}>
      <Icon name={icon} size={28} color={colors.text.icon} />
    </View>
  );
}

/** 파란 알약 버튼 */
function PrimaryPill(props: { icon: IconName; label: string; onPress(): void }) {
  return (
    <PressableScale style={styles.primary} onPress={props.onPress} accessibilityRole="button">
      <Icon name={props.icon} size={18} color={colors.text.inverse} />
      <Text style={[typography.bodyMedium, styles.primaryText]}>{props.label}</Text>
    </PressableScale>
  );
}

/**
 * S21 자료 부족(Figma 201-10470). 지금 수와 기준(3곳·2명, Q-9-5), [장소 더 모으기], [취향 입력].
 * 판정은 서버의 insufficientData를 따른다.
 */
export function InsufficientView(props: {
  lines: readonly [string, string];
  onMorePlaces(): void;
  onPreferences(): void;
}) {
  return (
    <View style={styles.center}>
      <Badge icon="bulb" />
      <Text style={[typography.title2, styles.title]}>추천하기엔 아직 부족해요</Text>
      <View style={styles.box}>
        <View style={styles.boxLine}>
          <Icon name="bookmark" size={16} color={colors.text.icon} />
          <Text style={[typography.sub, styles.boxText]}>{props.lines[0]}</Text>
        </View>
        <View style={styles.boxLine}>
          <Icon name="people" size={16} color={colors.text.icon} />
          <Text style={[typography.sub, styles.boxText]}>{props.lines[1]}</Text>
        </View>
      </View>
      <PrimaryPill icon="bookmark" label="장소 더 모으기" onPress={props.onMorePlaces} />
      <PressableScale
        style={styles.textButton}
        onPress={props.onPreferences}
        accessibilityRole="button"
      >
        <Icon name="heart" size={16} color={colors.text.icon} />
        <Text style={[typography.bodyMedium, styles.textButtonText]}>취향 입력</Text>
      </PressableScale>
    </View>
  );
}

/** S21 생성 실패(Figma 201-10530). 설명 없이 경고 아이콘과 제목, [다시 시도] */
export function RecommendFailView({ onRetry }: { onRetry(): void }) {
  return (
    <View style={styles.center}>
      <Badge icon="alert" />
      <Text style={[typography.title2, styles.title]}>추천을 만들지 못했어요</Text>
      <PrimaryPill icon="refresh" label="다시 시도" onPress={onRetry} />
    </View>
  );
}

/**
 * S21 겹침 없음 위 안내(Figma 201-10340). 응답에 사람별 묶음이 없어
 * 결과는 그 아래 한 목록으로 보인다(Q-9-4).
 */
export function NoOverlapNotice() {
  return (
    <View style={styles.notice}>
      <View style={styles.noticeIcon}>
        <Icon name="people" size={20} color={colors.text.icon} />
      </View>
      <View style={styles.noticeTexts}>
        <Text style={[typography.bodyBold, styles.noticeTitle]}>함께 담은 장소가 아직 없어요</Text>
        <Text style={[typography.caption, styles.noticeBody]}>
          그래서 한 사람의 취향을 따로 반영했어요
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[32],
    paddingBottom: 80,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text.default, marginTop: spacing[20], textAlign: 'center' },
  body: { color: colors.text.icon, marginTop: spacing[6], textAlign: 'center' },
  box: {
    alignSelf: 'stretch',
    gap: spacing[8],
    marginTop: spacing[16],
    padding: spacing[14],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  boxLine: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  boxText: { flex: 1, color: colors.text.icon },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    height: 48,
    marginTop: spacing[24],
    paddingHorizontal: spacing[24],
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
  },
  primaryText: { color: colors.text.inverse },
  textButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    minHeight: 48,
    paddingHorizontal: spacing[16],
    marginTop: spacing[8],
  },
  textButtonText: { color: colors.text.icon },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    padding: spacing[16],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  noticeIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeTexts: { flex: 1, gap: spacing[2] },
  noticeTitle: { color: colors.text.default },
  noticeBody: { color: colors.text.icon },
});
