import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AvatarGroup, Icon, Tag } from '@/components/ui';
import { colors, layout, radius, spacing, typography } from '@/theme';

import type { CandidateOption } from '../types';

type Props = {
  option: CandidateOption;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
};

/**
 * N8·후보 추가 시트의 후보 한 줄. 줄 전체를 눌러 고른다.
 * 장소 후보는 사진 자리 72와 주소(Figma 385-810), 지역 후보는 이름과 "그룹 즐겨찾기 N곳"(Figma 418-188)
 */
export function OptionRow({ option, checked, disabled = false, onToggle }: Props) {
  const isPlace = 'placeId' in option.input;
  const overlap = option.savedCount !== undefined && option.savedCount >= 2;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={option.title}
      accessibilityState={{ checked, disabled }}
      aria-checked={checked}
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <View style={[styles.check, checked && styles.checkOn]}>
        {checked ? <Icon name="check" size={14} color={colors.text.inverse} /> : null}
      </View>
      {isPlace ? (
        <View style={styles.thumb}>
          <Icon name="image" size={20} color={colors.text.muted} />
        </View>
      ) : null}
      <View style={styles.texts}>
        <Text style={styles.title} numberOfLines={1}>
          {option.title}
        </Text>
        {option.subtitle ? (
          <View style={styles.sub}>
            {isPlace ? <Icon name="map-pin" size={16} color={colors.text.icon} /> : null}
            <Text style={styles.subText} numberOfLines={1}>
              {option.subtitle}
            </Text>
          </View>
        ) : null}
        {(option.savers?.length ?? 0) > 0 || overlap ? (
          // 피그마 385-827: 담은 동행 얼굴, "세은, 승기", 겹침 태그. 위 4, 사이 8
          <View style={styles.savers}>
            {option.savers && option.savers.length > 0 ? (
              <>
                <AvatarGroup people={option.savers.map((name) => ({ name }))} max={3} />
                <Text style={styles.subText} numberOfLines={1}>
                  {option.savers.join(', ')}
                </Text>
              </>
            ) : null}
            {overlap ? (
              <Tag label={`겹침 ${option.savedCount}명`} tone="brandSoft" icon="people" small />
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 피그마: 체크·사진·글자 사이 20, 위 맞춤
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[20],
    minHeight: layout.minTouchTarget,
    paddingVertical: spacing[4],
  },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
  check: {
    width: 24,
    height: 24,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.gray[300],
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.line.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: spacing[6] },
  title: { ...typography.bodyBold, color: colors.text.default },
  sub: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  subText: { ...typography.caption, color: colors.text.icon, flexShrink: 1 },
  savers: { flexDirection: 'row', alignItems: 'center', gap: spacing[8], paddingTop: spacing[4] },
});
