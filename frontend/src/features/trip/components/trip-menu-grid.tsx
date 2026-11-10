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
  {
    key: 'poll',
    label: '투표',
    icon: 'check',
    // S22 지역·장소 투표(투표 명세). 폴더(polls/index.tsx)라 평가 메뉴처럼 실제 주소로 보낸다
    open: (tripId) => router.push(`/trips/${tripId}/polls`),
  },
  { key: 'course', label: '코스', icon: 'map-pin' },
  { key: 'today', label: '여행 중', icon: 'trip' },
  {
    key: 'photos',
    label: '사진',
    icon: 'image',
    // S31 여행 사진 목록(photos/index.tsx). 경비처럼 실제 주소로 보낸다
    open: (tripId) => router.push(`/trips/${tripId}/photos`),
  },
  {
    key: 'review',
    label: '평가',
    icon: 'star',
    // 평가 목록도 폴더(visits/index.tsx)라 경비처럼 실제 주소로 보낸다. pathname 객체는 타입 검사가 막는다
    open: (tripId) => router.push(`/trips/${tripId}/visits`),
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
  {
    key: 'chat',
    label: '채팅',
    icon: 'chat',
    // S47 대화방(채팅 명세). 여행 아래 주소라 나가기의 dismissAll이 함께 닫는다
    open: (tripId) => router.push({ pathname: '/trips/[tripId]/chat', params: { tripId } }),
  },
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
              <Icon name={item.icon} size={22} color={colors.text.default} />
            </View>
            <Text style={[typography.captionMedium, styles.label]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 피그마 S17 여행 메뉴: 제목과 격자 사이 20, 줄 사이 20, 아이콘과 이름 사이 8
  wrap: { gap: spacing[20] },
  title: { color: colors.text.default },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing[20] },
  cell: { width: '20%', alignItems: 'center', gap: spacing[8] },
  pressed: { opacity: 0.6 },
  iconBox: {
    width: 48,
    height: 48,
    // 피그마: 회색 동그라미 48(새 소식이 있는 메뉴만 연파랑, 새 소식 점은 기능이 생긴 뒤)
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.default,
  },
  label: { color: colors.text.default },
});
