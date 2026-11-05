import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * 말풍선 높이 28 + 간격 4 + 점 칸 16(점 8, 퍼지는 원 16). 점 위아래로 원이 4씩 더 있어
 * 말풍선과 점 사이는 보기에 8(Figma)이다. 마커 앵커(점 가운데)를 맞출 때 쓴다
 */
export const MAP_PILL_GAP = 4;
export const MAP_PILL_HEIGHT = 28;
export const MAP_DOT = 8;
/** 점 칸. 퍼지는 원(16)이 마커 그림 밖으로 나가지 않게 원 크기만큼 잡는다 */
export const MAP_DOT_AREA = 16;
export const MAP_MARKER_HEIGHT = MAP_PILL_HEIGHT + MAP_PILL_GAP + MAP_DOT_AREA;

export type MapPillProps = {
  /** 말풍선 글자. "강릉" */
  label?: string;
  /** 얼굴 묶음 대신 쓰는 사람 첫 글자. S20처럼 누가 담았는지 보여 줄 때 ["세", "승"] */
  initials?: string[];
  /** 개수. 없으면 숫자 칸이 없다 */
  count?: number;
  /** 개수 앞 아이콘. 홈은 사람(people), 저장은 책갈피(bookmark) */
  countIcon?: IconName;
  /**
   * brand: 파란 굵은 숫자(S05 친구 수) / brandDark: 진파랑 보통 숫자(S10 저장 수)
   * / badge: 파란 동그라미 안 흰 숫자(S20 겹친 사람 수)
   */
  countTone?: 'brand' | 'brandDark' | 'badge';
  /** 강조. 연파랑 바탕(S20 겹친 곳, 고른 마커) */
  highlighted?: boolean;
  /** 점 색. 홈은 진한 회색, 저장·그룹 즐겨찾기는 파랑 */
  dot?: 'dark' | 'brand';
  /** 점 뒤 퍼지는 파란 원(S05 홈 지역 마커) */
  ring?: boolean;
};

/**
 * 지도 말풍선 마커의 모양. 흰 알약(높이 28, 그림자) + 아래 점(8).
 * 지도 위에는 MapMarker가 이걸 감싸 올리고, 지도 밖(목록 범례 등)에서도 그대로 쓸 수 있다.
 * Figma: S05 "강릉 👥 3", S10 "강릉 🔖 2", S20 얼굴 묶음 + 겹친 수.
 */
export function MapPill({
  label,
  initials,
  count,
  countIcon,
  countTone = 'brand',
  highlighted = false,
  dot = 'dark',
  ring = false,
}: MapPillProps) {
  const countColor = countTone === 'brandDark' ? colors.brand.primaryDark : colors.brand.primary;
  const hasInitials = Boolean(initials?.length);

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View
        style={[
          styles.pill,
          hasInitials ? styles.pillInitials : styles.pillLabel,
          highlighted && styles.pillHighlighted,
        ]}
      >
        {hasInitials ? (
          <View style={styles.initials}>
            {initials!.map((ch, i) => (
              <View key={`${ch}-${i}`} style={[styles.initial, i > 0 && styles.initialOverlap]}>
                <Text style={[typography.captionBold, styles.initialText]}>{ch}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {label ? <Text style={[typography.captionMedium, styles.label]}>{label}</Text> : null}
        {count !== undefined && countTone === 'badge' ? (
          <View style={styles.badge}>
            <Text style={[typography.captionBold, styles.badgeText]}>{count}</Text>
          </View>
        ) : count !== undefined ? (
          <View style={styles.count}>
            {countIcon ? <Icon name={countIcon} size={16} color={colors.text.sub2} /> : null}
            <Text
              style={[
                countTone === 'brand' ? typography.captionBold : typography.captionMedium,
                { color: countColor },
              ]}
            >
              {count}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.dotArea}>
        {ring ? <View style={styles.ring} /> : null}
        <View style={[styles.dot, dot === 'brand' ? styles.dotBrand : styles.dotDark]} />
      </View>
    </View>
  );
}

const SHADOW = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.2,
  shadowRadius: 1.5,
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: MAP_PILL_GAP, alignSelf: 'flex-start' },
  pill: {
    height: MAP_PILL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    ...SHADOW,
  },
  pillLabel: { gap: spacing[8], paddingLeft: spacing[12], paddingRight: spacing[10] },
  pillInitials: { gap: spacing[6], paddingLeft: spacing[4], paddingRight: spacing[6] },
  pillHighlighted: { backgroundColor: colors.brand.primaryLight },
  label: { color: colors.text.default },
  // 값 문서 S10: 아이콘과 개수 사이 2
  count: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: spacing[6],
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.text.inverse },
  initials: { flexDirection: 'row' },
  initial: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.surface.white,
    backgroundColor: colors.line.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialOverlap: { marginLeft: -6 },
  initialText: { color: colors.text.strong, fontSize: 11, lineHeight: 14 },
  dotArea: {
    width: MAP_DOT_AREA,
    height: MAP_DOT_AREA,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: MAP_DOT_AREA,
    height: MAP_DOT_AREA,
    borderRadius: MAP_DOT_AREA / 2,
    backgroundColor: colors.brand.primary,
    opacity: 0.25,
  },
  dot: { width: MAP_DOT, height: MAP_DOT, borderRadius: MAP_DOT / 2, ...SHADOW },
  dotDark: { backgroundColor: colors.text.default },
  dotBrand: { backgroundColor: colors.brand.primary },
});
