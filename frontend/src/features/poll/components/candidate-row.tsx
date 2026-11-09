import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, Tag, type IconName } from '@/components/ui';
import { colors, layout, radius, spacing, typography } from '@/theme';

export type CandidateRowTone = 'mine' | 'plain' | 'winner' | 'muted';

type Props = {
  name: string;
  votes: number;
  /** 막대 길이 0~1 */
  ratio: number;
  /** mine 내가 고름(연파랑) / plain 기본 / winner 확정(초록) / muted 결과에서 표 없음 */
  tone: CandidateRowTone;
  /** 체크 원을 보인다(진행 중·동률 결과) */
  showCheck?: boolean;
  checked?: boolean;
  mineTag?: boolean;
  newTag?: boolean;
  topTag?: boolean;
  /** 이름 아래 보조 줄 */
  sub?: { icon: IconName; text: string } | null;
  /** 막대 색을 바꾼다. 결과 화면에서 확정되지 않은 곳은 회색(Figma 201-11073·201-11213) */
  barColor?: string;
  onPress?: () => void;
  disabled?: boolean;
};

/**
 * S22 후보 한 줄(Figma 201-10983). 체크 원, 이름, '내 선택'·'새 후보'·'가장 많이' 태그, 보조 줄, 표 수, 막대.
 * 진행 중에는 줄 전체를 눌러 내 선택에 넣거나 뺀다
 */
export function CandidateRow({
  name,
  votes,
  ratio,
  tone,
  showCheck = false,
  checked = false,
  mineTag = false,
  newTag = false,
  topTag = false,
  sub = null,
  barColor,
  onPress,
  disabled = false,
}: Props) {
  const fill =
    barColor ??
    (tone === 'winner'
      ? colors.status.success
      : tone === 'muted'
        ? colors.text.muted
        : colors.brand.primary);
  const content = (
    <>
      <View style={styles.top}>
        {showCheck ? (
          <View style={[styles.check, checked && styles.checkOn]}>
            {checked ? <Icon name="check" size={14} color={colors.text.inverse} /> : null}
          </View>
        ) : null}
        <View style={styles.texts}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, tone === 'muted' && styles.nameMuted]} numberOfLines={1}>
              {name}
            </Text>
            {mineTag ? <Tag label="내 선택" tone="brand" small /> : null}
            {newTag ? (
              // 공통 Tag에 주황 톤이 없어 여기서 같은 모양(높이 20·좌우 6)으로 그린다(Figma 385-2305)
              <View style={styles.newTag}>
                <Text style={styles.newTagText}>새 후보</Text>
              </View>
            ) : null}
            {topTag ? <Tag label="가장 많이" tone="success" icon="check" small /> : null}
          </View>
          {sub ? (
            <View style={styles.sub}>
              <Icon name={sub.icon} size={14} color={colors.text.sub} />
              <Text style={styles.subText} numberOfLines={1}>
                {sub.text}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.votes, tone === 'muted' && styles.nameMuted]}>{`${votes}표`}</Text>
      </View>
      <View style={styles.track}>
        <View
          style={[styles.fill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: fill }]}
        />
      </View>
    </>
  );

  const box = [styles.row, BG[tone]];
  if (!onPress) return <View style={box}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={`${name} ${votes}표`}
      accessibilityState={{ checked, disabled }}
      aria-checked={checked}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [...box, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const BG = StyleSheet.create({
  mine: { backgroundColor: colors.brand.primaryBg },
  plain: { backgroundColor: colors.surface.default },
  winner: { backgroundColor: colors.status.successBg2 },
  muted: { backgroundColor: colors.surface.subtle },
});

const styles = StyleSheet.create({
  // 피그마: 둥글기 16, 좌우 20, 위아래 16, 줄 사이 12
  row: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing[20],
    paddingVertical: spacing[16],
    gap: spacing[12],
    minHeight: layout.minTouchTarget,
  },
  pressed: { opacity: 0.7 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  check: {
    width: 24,
    height: 24,
    borderRadius: radius.md,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.brand.primary },
  texts: { flex: 1, gap: spacing[2] },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[8], flexWrap: 'wrap' },
  name: { ...typography.bodyBold, color: colors.text.default, flexShrink: 1 },
  nameMuted: { color: colors.text.sub },
  newTag: {
    height: 20,
    paddingHorizontal: spacing[6],
    borderRadius: radius.sm,
    justifyContent: 'center',
    backgroundColor: colors.status.warningBg2,
  },
  newTagText: { ...typography.captionMedium, color: colors.status.warning },
  sub: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  subText: { ...typography.caption, color: colors.text.sub, flexShrink: 1 },
  votes: { ...typography.bodyBold, color: colors.text.default, fontVariant: ['tabular-nums'] },
  // 피그마: 흰 줄 높이 6, 끝 둥글게
  track: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: radius.full },
});
