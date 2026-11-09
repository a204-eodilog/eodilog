import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui';
import { colors, layout, radius, spacing, typography } from '@/theme';

type Action =
  /** 여행지: 흰 알약 [투표 후보로] */
  | { kind: 'vote'; onPress(): void }
  /** 맛집·스팟: 파란 알약 [담기]. 담았으면 '담김' */
  | { kind: 'save'; saved: boolean; busy: boolean; onPress(): void };

type Props = {
  title: string;
  /** 지역 이름이나 주소 */
  location: string | null;
  reason: string;
  /** 추천 이유 앞 아이콘. 여행지는 책갈피, 맛집·스팟은 사람들 */
  reasonIcon: IconName;
  action: Action;
};

/**
 * S21 추천 카드(Figma 201-10081). 사진 자리, 이름, 위치, 추천 이유, 오른쪽 아래 버튼.
 * 응답에 사진과 사람별 취향이 없어 사진 자리 아이콘과 이유 한 줄만 보인다(Q-9-3).
 */
export function RecommendCard({ title, location, reason, reasonIcon, action }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.photo}>
          <Icon name="map-pin" size={22} color={colors.text.muted} />
        </View>
        <View style={styles.texts}>
          <Text style={[typography.bodyBold, styles.title]} numberOfLines={1}>
            {title}
          </Text>
          {location ? (
            <View style={styles.line}>
              <Icon name="map-pin" size={12} color={colors.text.icon} />
              <Text style={[typography.caption, styles.location]} numberOfLines={1}>
                {location}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.line}>
        <Icon name={reasonIcon} size={14} color={colors.text.icon} />
        <Text style={[typography.caption, styles.reason]}>{reason}</Text>
      </View>
      <View style={styles.bottom}>
        {action.kind === 'vote' ? (
          <Pressable
            style={[styles.pill, styles.vote]}
            onPress={action.onPress}
            // 버튼은 높이 36이라 위아래로 누르는 영역을 넓힌다
            hitSlop={{ top: 4, bottom: 4 }}
            accessibilityRole="button"
            accessibilityLabel={`${title} 투표 후보로`}
          >
            <Icon name="check" size={16} color={colors.text.default} />
            <Text style={[typography.subMedium, styles.voteText]}>투표 후보로</Text>
          </Pressable>
        ) : action.saved ? (
          <View
            style={[styles.pill, styles.saved]}
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            accessibilityLabel={`${title} 담김`}
          >
            <Icon name="check" size={16} color={colors.brand.primary} />
            <Text style={[typography.subMedium, styles.savedText]}>담김</Text>
          </View>
        ) : (
          <Pressable
            style={[styles.pill, styles.save]}
            onPress={action.onPress}
            // 버튼은 높이 36이라 위아래로 누르는 영역을 넓힌다
            hitSlop={{ top: 4, bottom: 4 }}
            disabled={action.busy}
            accessibilityRole="button"
            accessibilityLabel={`${title} 그룹 즐겨찾기에 담기`}
            accessibilityState={{ disabled: action.busy }}
          >
            {action.busy ? (
              <ActivityIndicator size="small" color={colors.text.inverse} />
            ) : (
              <Icon name="people" size={16} color={colors.text.inverse} />
            )}
            <Text style={[typography.subMedium, styles.saveText]}>담기</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing[14],
    padding: spacing[18],
    borderRadius: radius.xl,
    backgroundColor: colors.surface.default,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing[14] },
  photo: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.line.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: spacing[4] },
  title: { color: colors.text.default },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  location: { flex: 1, color: colors.text.icon },
  reason: { flex: 1, color: colors.text.default },
  bottom: { flexDirection: 'row', justifyContent: 'flex-end' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    height: 36,
    minWidth: layout.minTouchTarget,
    paddingLeft: spacing[12],
    paddingRight: spacing[16],
    borderRadius: radius.full,
  },
  vote: { backgroundColor: colors.surface.white },
  voteText: { color: colors.text.default },
  save: { backgroundColor: colors.brand.primary },
  saveText: { color: colors.text.inverse },
  saved: { backgroundColor: colors.brand.primaryBg },
  savedText: { color: colors.brand.primary },
});
