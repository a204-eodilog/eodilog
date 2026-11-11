import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, Tag } from '@/components/ui';
import { CheckMarkWhen } from '@/components/ui/check-mark';
import { colors, spacing, typography } from '@/theme';

import { metaLine, sourceTag } from '../checklist-rules';
import type { ChecklistItem } from '../types';

type Props = {
  item: ChecklistItem;
  /** 챙긴 사람 이름을 찾을 여행 멤버 */
  members: readonly { id: string; name: string }[];
  onToggle(item: ChecklistItem): void;
  onMore(item: ChecklistItem): void;
};

/**
 * 준비물 한 줄(Figma 201-15343). 체크 상자와 이름 영역을 누르면 체크가 바뀌고, 오른쪽 점 세 개로 고치기 시트를 연다.
 * 챙긴 항목은 이름을 흐리게, 이름 아래에는 제안 이유와 챙긴 사람을 한 줄로 보인다.
 */
export function ChecklistRow({ item, members, onToggle, onMore }: Props) {
  const tag = sourceTag(item);
  const meta = metaLine(item, members);
  const hasReason = Boolean(item.reason?.trim());
  // 화면 읽기 기능이 이름 뒤에 출처, 이유, 챙긴 사람을 이어 읽는다
  const hint = [tag, meta].filter((t): t is string => Boolean(t)).join(', ');
  return (
    <View style={styles.row}>
      <Pressable
        style={styles.main}
        onPress={() => onToggle(item)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.checked }}
        accessibilityLabel={item.label}
        accessibilityHint={hint || undefined}
        hitSlop={{ top: 4, bottom: 4 }}
      >
        <View style={[styles.box, item.checked ? styles.boxOn : styles.boxOff]}>
          <CheckMarkWhen checked={item.checked} size={16} />
        </View>
        <View style={styles.texts}>
          <View style={styles.titleRow}>
            <Text
              style={[typography.body, styles.label, item.checked && styles.labelDone]}
              lineBreakStrategyIOS="hangul-word"
            >
              {item.label}
            </Text>
            {tag ? (
              // Tag는 스스로 위쪽에 붙으므로 감싸서 이름과 세로 가운데를 맞춘다
              <View style={styles.tagWrap}>
                <Tag label={tag} small />
              </View>
            ) : null}
          </View>
          {meta ? (
            <View style={styles.metaRow}>
              {/* 서버가 이유 종류를 주지 않아 아이콘은 전구 하나로 쓴다(가정 Q-5-2) */}
              <Icon name={hasReason ? 'bulb' : 'person'} size={16} color={colors.text.icon} />
              <Text style={[typography.caption, styles.meta]}>{meta}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        style={styles.more}
        onPress={() => onMore(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.label} 고치기`}
      >
        <Icon name="more" size={20} color={colors.text.icon} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[6], minHeight: 52 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[14] },
  box: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.brand.primary },
  boxOff: { backgroundColor: colors.line.default },
  texts: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing[8] },
  label: { color: colors.text.default, flexShrink: 1 },
  tagWrap: { justifyContent: 'center' },
  labelDone: { color: colors.text.sub },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  meta: { color: colors.text.icon, flexShrink: 1 },
  more: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
});
