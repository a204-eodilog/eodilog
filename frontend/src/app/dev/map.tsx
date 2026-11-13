import { SCROLL_DECELERATION } from '@/theme/scroll';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CenterPin, MapHint, MapMarker, MapPill, MapView } from '@/components/map';
import { Button, Chip, Header, toast } from '@/components/ui';
import { pickPlace } from '@/features/place/place-picker';
import { colors, layout, radius, spacing, typography } from '@/theme';

type Example = 'home' | 'saved' | 'group' | 'pick';

const EXAMPLES: { key: Example; label: string }[] = [
  { key: 'home', label: '홈(S05)' },
  { key: 'saved', label: '저장(S10)' },
  { key: 'group', label: '그룹(S20)' },
  { key: 'pick', label: '위치 고르기(S13)' },
];

/** 피그마 예시와 같은 지역. 좌표는 각 시의 대략 가운데 */
const HOME = [
  { label: '강릉', count: 3, latitude: 37.7519, longitude: 128.8761 },
  { label: '경주', count: 2, latitude: 35.8562, longitude: 129.2247 },
  { label: '여수', count: 1, latitude: 34.7604, longitude: 127.6622 },
  { label: '제주', count: 2, latitude: 33.4996, longitude: 126.5312 },
];
const SAVED = [
  { label: '강릉', count: 2, latitude: 37.7519, longitude: 128.8761 },
  { label: '부산', count: 3, latitude: 35.1796, longitude: 129.0756 },
];
const GROUP = [
  { initials: ['영'], latitude: 35.1631, longitude: 129.0533 },
  { initials: ['세', '승'], count: 2, latitude: 35.1587, longitude: 129.1604, highlighted: true },
  { initials: ['세'], latitude: 35.1453, longitude: 129.1131 },
  { initials: ['승', '영'], count: 2, latitude: 35.1061, longitude: 128.9668 },
  { initials: ['세', '영'], count: 2, latitude: 35.0884, longitude: 129.0688 },
];
const BUSAN = { latitude: 35.03, longitude: 128.93, latitudeDelta: 0.18, longitudeDelta: 0.27 };
const SUYEONG = { latitude: 35.145, longitude: 129.1, latitudeDelta: 0.03, longitudeDelta: 0.04 };

/**
 * 지도 공통 부품 모아 보기(/dev/map). 지도는 안드로이드 개발 빌드에서만 보이고,
 * 웹에서는 지도 자리에 대체 상자와 아래 말풍선 모양만 보인다.
 */
export default function MapCatalog() {
  const [example, setExample] = useState<Example>('home');

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <Header title="지도 부품" subtitle="개발용 · /dev/map" />
      <View style={styles.chips}>
        {EXAMPLES.map((e) => (
          <Chip
            key={e.key}
            label={e.label}
            size="sm"
            selected={example === e.key}
            onPress={() => setExample(e.key)}
          />
        ))}
      </View>

      <View style={styles.mapArea}>
        {/* key로 예시가 바뀔 때마다 지도를 새로 만들어 처음 범위를 다시 적용한다 */}
        <MapView
          key={example}
          initialRegion={example === 'group' ? BUSAN : example === 'pick' ? SUYEONG : undefined}
          onCameraIdle={
            example === 'pick'
              ? ({ latitude, longitude }) =>
                  toast.show(`가운데 ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
              : undefined
          }
        >
          {example === 'home'
            ? HOME.map((m) => (
                <MapMarker
                  key={m.label}
                  {...m}
                  countIcon="people"
                  ring
                  onPress={() => toast.show(`${m.label} 친구 여행 ${m.count}개`)}
                />
              ))
            : null}
          {example === 'saved'
            ? SAVED.map((m) => (
                <MapMarker
                  key={m.label}
                  {...m}
                  countIcon="bookmark"
                  countTone="brandDark"
                  dot="brand"
                  onPress={() => toast.show(`${m.label} 저장 ${m.count}곳`)}
                />
              ))
            : null}
          {example === 'group'
            ? GROUP.map((m, i) => (
                <MapMarker
                  key={i}
                  {...m}
                  countTone="badge"
                  dot="brand"
                  zIndex={m.highlighted ? 1 : 0}
                  onPress={() => toast.show(`${m.initials.join(', ')}이(가) 담은 장소`)}
                />
              ))
            : null}
        </MapView>
        {example === 'pick' ? (
          <>
            <CenterPin />
            <View style={styles.hint} pointerEvents="none">
              <MapHint text="지도를 움직여 위치를 맞춰 주세요" />
            </View>
          </>
        ) : null}
      </View>

      <ScrollView
        decelerationRate={SCROLL_DECELERATION}
        style={styles.legend}
        contentContainerStyle={styles.legendContent}
      >
        <Text style={[typography.label, styles.sectionTitle]}>
          말풍선 모양 (지도 밖에서도 같음)
        </Text>
        <View style={styles.row}>
          <MapPill label="강릉" count={3} countIcon="people" ring />
          <MapPill label="강릉" count={2} countIcon="bookmark" countTone="brandDark" dot="brand" />
          <MapPill initials={['영']} dot="brand" />
          <MapPill initials={['세', '승']} count={2} countTone="badge" highlighted dot="brand" />
        </View>
        <Button
          label="S13 장소 고르기 열기"
          variant="secondary"
          size="sm"
          onPress={async () => {
            const place = await pickPlace({ near: { latitude: 35.1532, longitude: 129.1186 } });
            toast.show(place ? `고른 장소: ${place.name}` : '고르지 않고 돌아왔어요');
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[8],
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: spacing[12],
  },
  mapArea: { flex: 1, overflow: 'hidden' },
  hint: { position: 'absolute', top: spacing[16], left: 0, right: 0 },
  legend: {
    maxHeight: 140,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    marginTop: -radius.xxl,
    backgroundColor: colors.surface.white,
  },
  legendContent: { padding: layout.screenPaddingX, gap: spacing[12] },
  sectionTitle: { color: colors.text.sub },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: spacing[16] },
});
