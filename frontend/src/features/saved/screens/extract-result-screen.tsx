import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MapMarker, MapView } from '@/components/map';
import { Button, CenterNotice, Header, Icon, toast } from '@/components/ui';
import { pickPlace } from '@/features/place';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { cancelExtraction } from '../api';
import { ExtractSteps } from '../components/extract-steps';
import { PlaceSaveSheet } from '../components/place-save-sheet';
import {
  candidateLetter,
  EXTRACTION_STEPS,
  extractRegion,
  extractionView,
  failedNotice,
  progressStep,
  stepDetail,
} from '../extract-rules';
import { forgetExtraction, sentExtraction } from '../extract-session';
import { useExtraction, useRetryExtraction } from '../hooks/use-extraction';
import { addressParts } from '../saved-rules';
import type { Place } from '../types';

/** 성공 목록 한 줄. 후보 그대로이거나 S13에서 바꾼 장소 */
type FoundItem = { key: string; name: string; place: Place; evidence: string };

/** S13에서 직접 고른 장소의 근거 줄 */
const PICKED = '직접 고른 장소예요';

const areaOf = (place: Place) => addressParts(place.address).join(' ') || null;

/**
 * S12 추출 결과 확인(/saved/extract/{jobId}). S11 [장소 찾기]에서 온다.
 * GET /extractions/{jobId}를 끝날 때까지 다시 읽어 진행 중 → 성공·복수 후보·식별 불가·처리 실패로 바뀐다.
 * 성공: 지도 핀 + 장소 줄([연필] → S13으로 바꾸기, [X] 빼기) → [N곳] → S08 가져온 장소.
 * 복수 후보: 하나 고르고 [이곳으로] → 성공, [여기에 없어요] → S13. 식별 불가: [장소 직접 검색하기] → S13.
 * 그룹 즐겨찾기에서 시작(S20)은 S20 화면이 생기면 붙인다
 */
export function ExtractResultScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const insets = useSafeAreaInsets();
  const { query, timedOut } = useExtraction(jobId);
  const retry = useRetryExtraction();
  const sent = sentExtraction(jobId);

  const [removed, setRemoved] = useState<string[]>([]);
  const [replaced, setReplaced] = useState<Record<string, Place>>({});
  // 복수 후보·식별 불가에서 고른 장소. 고르면 그 한 곳으로 성공 상태가 된다
  const [picked, setPicked] = useState<{ place: Place; evidence: string } | null>(null);
  // 지도 칸 크기. 범위를 지도 비율에 맞춰야 핀이 가운데 온다(extractRegion)
  const [mapSize, setMapSize] = useState<{ width: number; height: number } | null>(null);
  const [choice, setChoice] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const data = query.data;
  const view = picked ? 'success' : data ? extractionView(data, timedOut) : null;
  // 시간이 지나 처리 실패로 본 작업(서버에서는 아직 진행 중)
  const stuck = timedOut && (data?.job.status === 'QUEUED' || data?.job.status === 'RUNNING');
  const found = (data?.candidates ?? []).filter(
    (c): c is typeof c & { place: Place } => c.place !== null,
  );

  const items: FoundItem[] = picked
    ? [
        {
          key: 'picked',
          name: picked.place.name,
          place: picked.place,
          evidence: picked.evidence,
        },
      ]
    : found
        .filter((c) => !removed.includes(c.candidateId))
        .map((c) => {
          const swap = replaced[c.candidateId];
          return swap
            ? { key: c.candidateId, name: swap.name, place: swap, evidence: PICKED }
            : { key: c.candidateId, name: c.name, place: c.place, evidence: c.evidence };
        });

  const choose = async (onPicked: (place: Place) => void, around?: Place) => {
    const place = await pickPlace(
      around ? { near: { latitude: around.latitude, longitude: around.longitude } } : {},
    );
    if (place) onPicked(place);
  };

  const cancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      await cancelExtraction(jobId);
      forgetExtraction(jobId);
      router.back();
    } catch {
      setCancelling(false);
      toast.error('취소하지 못했어요. 다시 시도해 주세요');
    }
  };

  const tryAgain = () => {
    if (!sent) {
      router.back();
      return;
    }
    retry.mutate(sent, {
      onSuccess: (next) => {
        // 멈춘 작업은 새 작업이 접수된 뒤에 취소한다. 먼저 취소하면 그 작업에만 쓴 캡처가 지워져
        // 새 작업이 400(captureAssetIds)을 받는다. 취소가 실패해도 다시 시도는 막지 않는다
        if (stuck) void cancelExtraction(jobId).catch(() => {});
        forgetExtraction(jobId);
        router.replace({ pathname: '/saved/extract/[jobId]', params: { jobId: next } });
      },
      onError: () => toast.error('다시 보내지 못했어요. 잠시 뒤 다시 시도해 주세요'),
    });
  };

  if (!data || view === null) {
    return (
      <View style={styles.screen}>
        <Header title="장소 찾기" largeTitle />
        {query.isError ? (
          <CenterNotice
            icon="alert"
            title="결과를 불러오지 못했어요"
            description="다시 시도해 주세요"
            actionLabel="다시 시도"
            actionIcon="refresh"
            onAction={() => void query.refetch()}
          />
        ) : (
          <ActivityIndicator style={styles.flex} color={colors.brand.primary} />
        )}
      </View>
    );
  }

  if (view === 'progress') {
    const step = progressStep(data.job.progress);
    return (
      <View style={styles.screen}>
        <Header title="장소 찾기" largeTitle />
        <View style={styles.progressBody}>
          <SourceChip link={sent?.link ?? null} captures={sent?.captureCount ?? 0} flat />
          <View style={styles.progressTexts}>
            <Text style={[typography.title1, styles.text]}>장소를 찾고 있어요</Text>
            <Text style={[typography.caption, styles.sub]}>보통 10초 안에 끝나요</Text>
          </View>
          <ExtractSteps steps={EXTRACTION_STEPS} current={step} detail={stepDetail(step, sent)} />
        </View>
        <View style={[styles.progressBottom, { paddingBottom: Math.max(insets.bottom + 12, 34) }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="취소"
            disabled={cancelling}
            onPress={() => void cancel()}
            style={({ pressed }) => [styles.cancel, (pressed || cancelling) && styles.pressed]}
          >
            <Text style={[typography.bodyMedium, styles.sub]}>취소</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (view === 'notFound' || view === 'failed') {
    const failed = view === 'failed';
    const notice = failedNotice(sent, stuck);
    return (
      <View style={styles.screen}>
        <Header title="장소 찾기" largeTitle />
        <CenterNotice
          icon={failed ? notice.icon : 'search'}
          title={failed ? notice.title : '장소를 알아내지 못했어요'}
          description={failed ? notice.description : '장소를 찾지 못했어요. 직접 골라 주세요'}
          actionLabel={failed ? '다시 시도' : '장소 직접 검색하기'}
          actionIcon={failed ? 'refresh' : 'search'}
          actionLoading={retry.isPending}
          onAction={
            failed ? tryAgain : () => void choose((place) => setPicked({ place, evidence: PICKED }))
          }
        />
      </View>
    );
  }

  const multiple = view === 'multiple';
  const region = mapSize
    ? extractRegion(
        multiple ? found.map((c) => c.place) : items.map((i) => i.place),
        mapSize.width / mapSize.height,
      )
    : null;

  return (
    <View style={styles.screen}>
      <Header title={multiple ? '장소 찾기' : '찾은 장소'} largeTitle />
      <View
        style={styles.flex}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (width > 0 && height > 0) setMapSize({ width, height });
        }}
      >
        {mapSize ? (
          <MapView
            key={
              region ? `${region.latitude}-${region.longitude}-${region.latitudeDelta}` : 'korea'
            }
            {...(region ? { initialRegion: region } : {})}
          >
            {multiple
              ? found.map((c, i) => (
                  <MapMarker
                    key={c.candidateId}
                    latitude={c.place.latitude}
                    longitude={c.place.longitude}
                    label={`${candidateLetter(i)} ${c.name}`}
                    dot="brand"
                    highlighted={i === choice}
                    zIndex={i === choice ? 1 : 0}
                    onPress={() => setChoice(i)}
                  />
                ))
              : items.map((item, i) => (
                  <MapMarker
                    key={item.key}
                    latitude={item.place.latitude}
                    longitude={item.place.longitude}
                    label={`${i + 1} ${item.name}`}
                    dot="brand"
                    highlighted={item.key === focused}
                    zIndex={item.key === focused ? 1 : 0}
                    onPress={() => setFocused(item.key)}
                  />
                ))}
          </MapView>
        ) : null}
        <View style={styles.chipWrap} pointerEvents="none">
          <SourceChip link={sent?.link ?? null} captures={sent?.captureCount ?? 0} />
        </View>
      </View>

      <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom + 12, 34) }]}>
        <View style={styles.handle} />
        {multiple ? (
          <>
            <Text style={[typography.title1, styles.text]}>어느 곳인가요?</Text>
            <View style={styles.inline}>
              <Icon name="map-pin" size={16} color={colors.text.icon} />
              <Text style={[typography.caption, styles.sub]}>
                같은 이름이 {found.length}곳 있어요
              </Text>
            </View>
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.candidates}
              accessibilityRole="radiogroup"
            >
              {found.map((c, i) => {
                const selected = i === choice;
                return (
                  <Pressable
                    key={c.candidateId}
                    accessibilityRole="radio"
                    accessibilityLabel={[candidateLetter(i), c.name, areaOf(c.place)]
                      .filter(Boolean)
                      .join(', ')}
                    accessibilityState={{ checked: selected }}
                    onPress={() => setChoice(i)}
                    style={[styles.candidate, selected && styles.candidateOn]}
                  >
                    <View style={[styles.letter, selected && styles.letterOn]}>
                      <Text style={[typography.captionBold, styles.inverse]}>
                        {candidateLetter(i)}
                      </Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={[typography.bodyBold, styles.text]} numberOfLines={1}>
                        {c.name}
                      </Text>
                      {areaOf(c.place) ? (
                        <View style={styles.inline}>
                          <Icon name="map-pin" size={16} color={colors.text.icon} />
                          <Text style={[typography.caption, styles.sub]} numberOfLines={1}>
                            {areaOf(c.place)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={[styles.radio, selected && styles.radioOn]}>
                      {selected ? <View style={styles.radioDot} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.buttons}>
              <Button
                label="여기에 없어요"
                variant="text"
                onPress={() =>
                  void choose(
                    (place) => setPicked({ place, evidence: PICKED }),
                    found[choice]?.place,
                  )
                }
                leading={<Icon name="search" size={20} color={colors.text.icon} />}
                style={styles.notHere}
              />
              <Button
                label="이곳으로"
                weight="medium"
                onPress={() => {
                  const c = found[choice];
                  if (c) setPicked({ place: { ...c.place, name: c.name }, evidence: c.evidence });
                }}
                leading={<Icon name="check" size={20} color={colors.text.inverse} />}
                style={styles.primary}
              />
            </View>
          </>
        ) : (
          <>
            <Text style={[typography.title1, styles.text]}>
              {items.length > 0 ? `장소 ${items.length}곳을 찾았어요` : '저장할 장소가 없어요'}
            </Text>
            <Text style={[typography.caption, styles.sub]}>
              {items.length > 0 ? '확인하고 저장해 주세요' : '다시 찾으려면 뒤로 가 주세요'}
            </Text>
            <ScrollView style={styles.list} contentContainerStyle={styles.rows}>
              {items.map((item, i) => (
                <Pressable
                  key={item.key}
                  onPress={() => setFocused(item.key)}
                  style={[styles.row, item.key === focused && styles.rowFocused]}
                >
                  <View style={styles.number}>
                    <Text style={[typography.label, styles.inverse]}>{i + 1}</Text>
                  </View>
                  <View style={styles.rowTexts}>
                    <Text style={[typography.bodyBold, styles.text]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {areaOf(item.place) ? (
                      <View style={styles.inline}>
                        <Icon name="map-pin" size={16} color={colors.text.icon} />
                        <Text style={[typography.caption, styles.sub]} numberOfLines={1}>
                          {areaOf(item.place)}
                        </Text>
                      </View>
                    ) : null}
                    {item.evidence ? (
                      <View style={styles.inline}>
                        <Icon name="bulb" size={16} color={colors.brand.primaryDark} />
                        <Text style={[typography.caption, styles.dark]} numberOfLines={2}>
                          {item.evidence}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.rowButtons}>
                    <RoundButton
                      icon="pencil"
                      label={`${item.name} 바꾸기`}
                      onPress={() =>
                        void choose((place) => {
                          if (picked) setPicked({ place, evidence: PICKED });
                          else setReplaced((r) => ({ ...r, [item.key]: place }));
                        }, item.place)
                      }
                    />
                    <RoundButton
                      icon="close"
                      label={`${item.name} 빼기`}
                      onPress={() => {
                        if (picked) setPicked(null);
                        else setRemoved((r) => [...r, item.key]);
                      }}
                    />
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.buttons}>
              <Button
                label={`${items.length}곳`}
                weight="medium"
                disabled={items.length === 0}
                onPress={() => setSaveOpen(true)}
                leading={<Icon name="bookmark" size={20} color={colors.text.inverse} />}
                style={styles.primary}
              />
            </View>
          </>
        )}
      </View>

      <PlaceSaveSheet
        visible={saveOpen}
        places={items.map((i) => ({ id: i.place.id, name: i.name }))}
        initialChoice="personal"
        memo={sent?.input.memo}
        onClose={() => setSaveOpen(false)}
        onSaved={(target) => {
          forgetExtraction(jobId);
          // S11·S12를 닫고 개인이면 S10, 그룹이면 그 여행으로(S20 그룹 즐겨찾기 화면이 생기면 그쪽으로)
          if (router.canDismiss()) router.dismissAll();
          if (target.kind === 'trip') {
            router.push({ pathname: '/trips/[tripId]', params: { tripId: target.tripId } });
          } else {
            router.navigate('/saved');
          }
        }}
      />
    </View>
  );
}

/** 원본 요약 칩: [링크 + 주소] [사진 + "2장"]. 보낸 입력을 모르면(앱을 다시 켬) 그리지 않는다 */
/** 보낸 원본 요약 칩. 지도 위(성공)는 그림자 있는 흰 칩, 진행 중 화면 위쪽은 flat(회색 바탕, 그림자 없음) */
function SourceChip({
  link,
  captures,
  flat = false,
}: {
  link: string | null;
  captures: number;
  flat?: boolean;
}) {
  if (!link && captures === 0) return null;
  return (
    <View style={[styles.chip, flat && styles.chipFlat]}>
      {link ? (
        <View style={[styles.inline, styles.shrink]}>
          <Icon name="link" size={16} color={colors.text.default} />
          <Text style={[typography.caption, styles.text, styles.shrink]} numberOfLines={1}>
            {link}
          </Text>
        </View>
      ) : null}
      {captures > 0 ? (
        <View style={styles.inline}>
          <Icon name="image" size={16} color={colors.text.default} />
          <Text style={[typography.caption, styles.text]}>{captures}장</Text>
        </View>
      ) : null}
    </View>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
}: {
  icon: 'pencil' | 'close';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.round, pressed && styles.pressed]}
    >
      <Icon name={icon} size={18} color={colors.text.icon} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
  dark: { color: colors.brand.primaryDark, flexShrink: 1 },
  inverse: { color: colors.text.inverse },
  pressed: { opacity: 0.6 },

  // 진행 중(FE 제안): 위에 원본 칩 → 제목 → 세로 단계 표시(ExtractSteps), 왼쪽 정렬. 아래 가운데 [취소]
  progressBody: {
    flex: 1,
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[14],
    alignItems: 'flex-start',
    gap: spacing[28],
  },
  progressTexts: { gap: spacing[2] },
  progressBottom: { alignItems: 'center' },
  cancel: { height: 48, paddingHorizontal: spacing[16], justifyContent: 'center' },

  // 원본 요약 칩: 흰 알약 높이 36, 좌우 12, 간격 14
  chipWrap: { position: 'absolute', top: spacing[12], left: 0, right: 0, alignItems: 'center' },
  chip: {
    maxWidth: '90%',
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    paddingHorizontal: spacing[12],
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    shadowColor: colors.text.default,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  chipFlat: {
    maxWidth: '100%',
    height: 32,
    backgroundColor: colors.surface.default,
    shadowOpacity: 0,
    elevation: 0,
  },

  // 아래 시트(지도 위에 겹치는 패널)
  panel: {
    marginTop: -radius.xxl,
    paddingHorizontal: layout.screenPaddingX,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    backgroundColor: colors.surface.white,
    shadowColor: colors.text.default,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    marginTop: spacing[12],
    marginBottom: spacing[16],
    borderRadius: radius.full,
    backgroundColor: colors.gray[300],
  },
  list: { flexGrow: 0, maxHeight: 280, marginTop: spacing[16] },
  rows: { gap: spacing[16], paddingTop: spacing[4] },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[18],
    borderRadius: radius.md,
  },
  rowFocused: { backgroundColor: colors.brand.primaryBg },
  number: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.primary,
  },
  rowTexts: { flex: 1, gap: spacing[8] },
  rowButtons: { flexDirection: 'row', gap: spacing[10] },
  round: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.default,
  },
  candidates: { gap: spacing[10] },
  candidate: {
    minHeight: 74,
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
  candidateOn: { backgroundColor: colors.brand.primaryBg },
  letter: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.text.sub2,
  },
  letterOn: { backgroundColor: colors.brand.primary },
  radio: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.gray[300],
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.brand.primary, backgroundColor: colors.brand.primary },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing[10],
    paddingTop: spacing[20],
  },
  notHere: { paddingHorizontal: spacing[12] },
  primary: { paddingLeft: spacing[20], paddingRight: spacing[24] },
});
