import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, toast, type IconName } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

type MenuItem = {
  key: string;
  label: string;
  icon: IconName;
  /** 화면이 있으면 그 화면으로 간다. 없으면 준비 중 안내를 띄운다 */
  open?: (tripId: string) => void;
};

// 공통 아이콘(components/ui/icon.tsx)에 없는 메뉴(추천·사진·평가·경비·게시)는 가까운 모양을 임시로 쓴다.
// 아이콘이 추가되면 바꾼다
const MENU: MenuItem[] = [
  { key: 'favorites', label: '즐겨찾기', icon: 'bookmark' },
  { key: 'recommend', label: '추천', icon: 'search' },
  { key: 'poll', label: '투표', icon: 'check' },
  { key: 'course', label: '코스', icon: 'map-pin' },
  { key: 'today', label: '여행 중', icon: 'trip' },
  { key: 'photos', label: '사진', icon: 'copy' },
  {
    key: 'review',
    label: '평가',
    icon: 'star',
    open: (tripId) => router.push({ pathname: '/trips/[tripId]/visits', params: { tripId } }),
  },
  {
    key: 'expense',
    label: '경비',
    icon: 'calendar',
    // 경비 목록(expenses/index.tsx). pathname '/trips/[tripId]/expenses/index'로 보내면
    // 'index'가 지출 id로 읽혀 지출 상세가 열리므로 실제 주소로 보낸다
    open: (tripId) => router.push(`/trips/${tripId}/expenses`),
  },
  { key: 'publish', label: '게시', icon: 'link' },
  { key: 'chat', label: '채팅', icon: 'chat' },
];

/**
 * S17 여행 메뉴 아이콘 격자. 상태와 관계없이 모두 열 수 있다.
 * 화면이 있는 메뉴는 그 화면으로 가고, 아직 없는 메뉴는 준비 중 안내를 띄운다(FR-020a).
 * 새 소식 점은 해당 기능이 생긴 뒤 붙인다.
 */
export function TripMenuGrid({ tripId }: { tripId: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={[typography.title3, styles.title]}>여행 메뉴</Text>
      <View style={styles.grid}>
        {MENU.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={() => (item.open ? item.open(tripId) : toast.show('준비 중이에요'))}
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
