import { SCROLL_DECELERATION } from '@/theme/scroll';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stagger } from '@/components/ui/stagger';
import { Spinner } from '@/components/ui/spinner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MapMarker, MapView } from '@/components/map';
import { Button, Header, Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, layout, radius, spacing, typography } from '@/theme';

type SavedPlaceViewProps = {
  name: string;
  /** "강릉 강문동". 주소가 없으면 null */
  area: string | null;
  latitude: number;
  longitude: number;
  memo: string | null;
  /** feed: 공동 피드에서 담음 / lost: 원본을 볼 수 없음(사진 대신 작은 지도) / none: 그 밖 */
  source: 'feed' | 'lost' | 'none';
  /** 장소가 사라져 장소 id가 없으면 메모 고치기·저장 해제를 할 수 없다 */
  editable: boolean;
  /** 저장 해제·되돌리기 요청 중. 저장 해제·메모 고치기·그룹에 추가를 모두 막아 같은 항목 요청이 겹치지 않게 한다 */
  busy?: boolean;
  onBack?: () => void;
  onUnsave: () => void;
  onEditMemo: () => void;
  /** 가져온 곳 줄 → S07 */
  onOpenSource: () => void;
  onAddToTrip: () => void;
};

/**
 * S14 저장 장소 상세. 상태: 기본 / 원본 공동 피드 삭제·볼 수 없음. 그룹에 추가는 AddToTripSheet.
 * 즐겨찾기 응답에 사진·키워드가 없어 사진 자리는 회색, 키워드 태그는 그리지 않는다
 */
export function SavedPlaceView({
  name,
  area,
  latitude,
  longitude,
  memo,
  source,
  editable,
  busy = false,
  onBack,
  onUnsave,
  onEditMemo,
  onOpenSource,
  onAddToTrip,
}: SavedPlaceViewProps) {
  const insets = useSafeAreaInsets();
  const lost = source === 'lost';

  return (
    <View style={styles.screen}>
      <Header
        onBack={onBack}
        right={
          editable ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="저장 해제"
              accessibilityState={{ disabled: busy, busy }}
              hitSlop={8}
              disabled={busy}
              onPress={onUnsave}
              style={styles.headerButton}
            >
              {busy ? (
                <Spinner color={colors.brand.primary} />
              ) : (
                <Icon name="bookmark" color={colors.brand.primary} filled />
              )}
            </PressableScale>
          ) : undefined
        }
      />
      <ScrollView decelerationRate={SCROLL_DECELERATION} contentContainerStyle={styles.content}>
        <Stagger itemStyle={styles.staggerItem}>
          {lost ? (
            <View style={styles.map}>
              <MapView
                initialRegion={{
                  latitude: latitude - 0.01,
                  longitude: longitude - 0.01,
                  latitudeDelta: 0.02,
                  longitudeDelta: 0.02,
                }}
                isScrollGesturesEnabled={false}
                isZoomGesturesEnabled={false}
              >
                <MapMarker latitude={latitude} longitude={longitude} label={name} dot="brand" />
              </MapView>
            </View>
          ) : (
            <View style={styles.photo} />
          )}

          <View style={styles.info}>
            <Text style={[typography.title1, styles.text]}>{name}</Text>
            <View style={styles.metaRow}>
              {area ? (
                <View style={styles.meta}>
                  <Icon name="map-pin" size={16} color={colors.text.icon} />
                  <Text style={[typography.caption, styles.sub]}>{area}</Text>
                </View>
              ) : null}
              <View style={styles.meta}>
                <Icon name="lock" size={16} color={colors.text.icon} />
                <Text style={[typography.caption, styles.sub]}>나만 봐요</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.label}>
              <Icon name="pencil" size={16} color={colors.text.icon} />
              <Text style={[typography.captionMedium, styles.sub]}>내 메모</Text>
            </View>
            <View style={styles.memoBox}>
              <Text style={[typography.body, memo ? styles.text : styles.placeholder, styles.flex]}>
                {memo || '메모가 없어요'}
              </Text>
              {editable ? (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel="메모 고치기"
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={onEditMemo}
                  style={({ pressed }) => [styles.memoButton, pressed && styles.pressed]}
                >
                  <Icon name="pencil" size={18} color={colors.text.default} />
                </PressableScale>
              ) : null}
            </View>
          </View>

          {source !== 'none' ? (
            <View style={styles.section}>
              <View style={styles.label}>
                <Icon name="link" size={16} color={colors.text.icon} />
                <Text style={[typography.captionMedium, styles.sub]}>가져온 곳</Text>
              </View>
              {lost ? (
                <View style={[styles.sourceRow, styles.sourceLost]}>
                  <View style={styles.sourceCircle}>
                    <Icon name="link" size={20} color={colors.text.icon} />
                  </View>
                  <Text style={[typography.body, styles.sub]}>원본을 더 볼 수 없어요</Text>
                </View>
              ) : (
                // 즐겨찾기 응답에 피드 제목·올린 사람이 없어 이름 대신 "공동 피드"로 보여 준다
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel="가져온 공동 피드 열기"
                  onPress={onOpenSource}
                  style={({ pressed }) => [styles.sourceRow, pressed && styles.pressed]}
                >
                  <View style={[styles.sourceCircle, styles.sourceCircleBrand]}>
                    <Icon name="trip" size={20} color={colors.brand.primary} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={[typography.bodyBold, styles.text]}>공동 피드</Text>
                    <Text style={[typography.caption, styles.sub]}>이 피드에서 담았어요</Text>
                  </View>
                  <Icon name="chevron-right" size={20} color={colors.text.icon} />
                </PressableScale>
              )}
            </View>
          ) : null}
        </Stagger>
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, BOTTOM_GAP) }]}>
        <Button
          label="그룹에 추가"
          icon="plus"
          weight="medium"
          disabled={!editable || busy}
          onPress={onAddToTrip}
          style={styles.add}
        />
      </View>
    </View>
  );
}

/** 아래 버튼 밑 여백(Figma 34). 기기 아래 안전 영역이 더 크면 그만큼 */
const BOTTOM_GAP = 34;

const styles = StyleSheet.create({
  // 차례로 나타나는 구역을 감싼 칸. 한 구역이 여러 줄이면 그 사이 간격을 스크롤 내용과 같게 둔다
  staggerItem: { gap: spacing[28] },
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
  placeholder: { color: colors.text.sub },
  headerButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingTop: spacing[16],
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: spacing[24],
    gap: spacing[28],
  },
  photo: { height: 196, borderRadius: radius.lg, backgroundColor: colors.line.default },
  map: { height: 140, borderRadius: radius.lg, overflow: 'hidden' },
  info: { gap: spacing[12] },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[14] },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  section: { gap: spacing[12] },
  label: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  memoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    paddingTop: spacing[14],
    paddingRight: spacing[8],
    paddingBottom: spacing[14],
    paddingLeft: spacing[18],
    borderRadius: radius.md,
    backgroundColor: colors.surface.default,
  },
  memoButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[18],
    paddingTop: spacing[14],
    paddingRight: spacing[18],
    paddingBottom: spacing[14],
    paddingLeft: spacing[14],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  sourceLost: { minHeight: 68 },
  sourceCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceCircleBrand: { backgroundColor: colors.brand.primaryBg },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[12],
  },
  add: { paddingLeft: spacing[20], paddingRight: spacing[24] },
});
