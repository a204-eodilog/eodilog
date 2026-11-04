import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, toast, type IconName } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

// 공통 아이콘(components/ui/icon.tsx)에 없는 메뉴(추천·사진·평가·경비·게시)는 가까운 모양을 임시로 쓴다.
// 아이콘이 추가되면 바꾼다
const MENU: { key: string; label: string; icon: IconName }[] = [
  { key: 'favorites', label: '즐겨찾기', icon: 'bookmark' },
  { key: 'recommend', label: '추천', icon: 'search' },
  { key: 'poll', label: '투표', icon: 'check' },
  { key: 'course', label: '코스', icon: 'map-pin' },
  { key: 'today', label: '여행 중', icon: 'trip' },
  { key: 'photos', label: '사진', icon: 'copy' },
  { key: 'review', label: '평가', icon: 'person' },
  { key: 'expense', label: '경비', icon: 'calendar' },
  { key: 'publish', label: '게시', icon: 'link' },
  { key: 'chat', label: '채팅', icon: 'chat' },
];

/**
 * S17 여행 메뉴 아이콘 격자. 상태와 관계없이 모두 열 수 있다.
 * 새 소식 점과 각 화면 연결은 해당 기능이 생긴 뒤 붙인다. 그전에는 준비 중 안내를 띄운다.
 */
export function TripMenuGrid() {
  return (
    <View style={styles.wrap}>
      <Text style={[typography.title3, styles.title]}>여행 메뉴</Text>
      <View style={styles.grid}>
        {MENU.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={() => toast.show('준비 중이에요')}
            style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
          >
            <View style={styles.iconBox}>
              <Icon name={item.icon} color={colors.brand.primary} />
            </View>
            <Text style={[typography.captionMedium, styles.label]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing[12] },
  title: { color: colors.text.default },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing[16] },
  cell: { width: '20%', alignItems: 'center', gap: spacing[6] },
  pressed: { opacity: 0.6 },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.primaryBg,
  },
  label: { color: colors.text.sub },
});
