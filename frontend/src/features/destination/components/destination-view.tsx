import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ErrorState, Header, Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { SkeletonList } from '@/components/ui/skeleton';
import { assetSource } from '@/lib/asset-image';
import { colors, layout, radius, spacing, typography } from '@/theme';

import type { DestinationInfo } from '../types';

export type DestinationViewProps = {
  state: 'loading' | 'error' | 'ready';
  info?: DestinationInfo;
  onPlace: (placeId: string) => void;
  onSavePlace: (place: { id: string; name: string }) => void;
  onNewTrip: () => void;
  onRetry: () => void;
};

/**
 * N3 여행지 정보(WD-FR-11). S09에서 들어온다. 지역 소개, 대표 장소([저장]은 S08 장소 저장 시트),
 * [새 여행]은 이 여행지를 넣은 채 S16으로(결정 F-23)
 */
export function DestinationView(props: DestinationViewProps) {
  const { info } = props;
  const cover = assetSource(info?.photos[0]);
  // 안드로이드 아래 버튼(3버튼 탐색) 위로 올린다. 화면 끝 기준 절대 위치라 안전 영역이 저절로 빠지지 않는다
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <Header title={info?.name} />
      {props.state === 'error' ? (
        <ErrorState
          title="여행지 정보를 불러오지 못했어요"
          description="불러오지 못했어요. 다시 시도해 주세요."
          onRetry={props.onRetry}
        />
      ) : props.state === 'loading' || !info ? (
        <SkeletonList style={styles.flex} />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.cover}>
              <Icon name="image" size={32} color={colors.brand.primary} />
              {cover ? (
                <Image source={cover} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : null}
            </View>

            <View style={styles.head}>
              <Text style={styles.title}>{info.name}</Text>
              {info.area ? (
                <View style={styles.area}>
                  <Icon name="map-pin" size={14} color={colors.text.icon} />
                  <Text style={styles.areaText}>{info.area}</Text>
                </View>
              ) : null}
              {info.introduction ? <Text style={styles.intro}>{info.introduction}</Text> : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>대표 장소</Text>
              {info.places.length === 0 ? (
                <Text style={styles.none}>아직 소개할 장소가 없어요</Text>
              ) : (
                info.places.map((p) => (
                  <View key={p.id} style={styles.place}>
                    <PressableScale
                      onPress={() => props.onPlace(p.id)}
                      style={({ pressed }) => [styles.placeMain, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel={p.name}
                    >
                      <View style={styles.thumb}>
                        <Icon name="image" size={20} color={colors.brand.primary} />
                      </View>
                      <View style={styles.placeText}>
                        <Text style={styles.placeName} numberOfLines={1}>
                          {p.name}
                        </Text>
                        {p.address ? (
                          <View style={styles.area}>
                            <Icon name="map-pin" size={14} color={colors.text.icon} />
                            <Text style={styles.areaText} numberOfLines={1}>
                              {p.address}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </PressableScale>
                    <PressableScale
                      onPress={() => props.onSavePlace({ id: p.id, name: p.name })}
                      style={({ pressed }) => [styles.save, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel={`${p.name} 저장`}
                    >
                      <Icon name="bookmark" size={20} color={colors.text.default} />
                    </PressableScale>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
          <View
            style={[styles.fab, { bottom: spacing[24] + insets.bottom }]}
            pointerEvents="box-none"
          >
            <Button
              label="새 여행"
              onPress={props.onNewTrip}
              leading={<Icon name="plus" size={20} color={colors.text.inverse} />}
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    paddingBottom: 120,
    gap: spacing[24],
  },
  cover: {
    height: 180,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.brand.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  head: { gap: spacing[8] },
  title: { ...typography.title1, color: colors.text.default },
  area: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], flexShrink: 1 },
  areaText: { ...typography.caption, color: colors.text.sub, flexShrink: 1 },
  intro: { ...typography.body, color: colors.text.strong, marginTop: spacing[8] },
  section: { gap: spacing[12] },
  sectionTitle: { ...typography.title3, color: colors.text.default },
  none: { ...typography.caption, color: colors.text.muted },
  place: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  placeMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[14] },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.brand.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeText: { flex: 1, minWidth: 0, gap: spacing[4] },
  placeName: { ...typography.bodyBold, color: colors.text.default },
  save: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: { position: 'absolute', right: layout.screenPaddingX, bottom: spacing[24] },
});
