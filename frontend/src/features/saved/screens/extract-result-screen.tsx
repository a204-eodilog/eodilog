import { SCROLL_DECELERATION } from '@/theme/scroll';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { apiErrorCode } from '@/api/errors';
import { FittedMap, MapMarker } from '@/components/map';
import { Button, CenterNotice, Header, Icon, toast } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { SkeletonList } from '@/components/ui/skeleton';
import { pickPlace } from '@/features/place';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { cancelExtraction } from '../api';
import { ExtractSteps } from '../components/extract-steps';
import { PlaceSaveSheet } from '../components/place-save-sheet';
import {
  candidateLetter,
  EXTRACTION_STEPS,
  type ExtractItem,
  extractItems,
  extractRegion,
  extractionView,
  failCause,
  failedNotice,
  FEATURE_OFF_MESSAGE,
  type GroupPick,
  groupCandidates,
  nextToChoose,
  notFoundNotice,
  shownStep,
  EXTRACTION_STEP_GUIDES,
  stepDetail,
  withoutBranch,
} from '../extract-rules';
import { forgetExtraction, sentExtraction } from '../extract-session';
import { useSavePlaces } from '../hooks/use-bookmark-mutations';
import { useExtraction, useRetryExtraction } from '../hooks/use-extraction';
import { addressParts, placeSavedMessage } from '../saved-rules';
import type { Place } from '../types';

/** 식별 불가에서 직접 고른 장소의 줄 key */
const PICKED_KEY = 'picked';

/** S13에서 직접 고른 장소의 근거 줄 */
const PICKED = '직접 고른 장소예요';

const areaOf = (place: Place) => addressParts(place.address).join(' ') || null;

/** 찾은 장소를 목록에서 빼는 버튼이 없어서, 뺀 것은 늘 없다 */
const NOTHING_REMOVED: string[] = [];

/**
 * S12 추출 결과 확인(/saved/extract/{jobId}). S11 [장소 찾기]에서 온다.
 * GET /extractions/{jobId}를 끝날 때까지 다시 읽어 진행 중 → 성공·복수 후보·식별 불가·처리 실패로 바뀐다.
 * 후보는 게시물 속 언급(같은 name)별로 묶는다(groupCandidates).
 * 복수 후보: 지점이 여럿인 언급마다 하나 고르고 [이곳으로], [여기에 없어요] → S13. 다 고르면 성공 목록.
 * 성공: 지도 핀 + 장소 줄([연필] → S13으로 바꾸기, [X] 빼기) → [N곳] → S08 가져온 장소.
 * 지도에서 못 찾은 언급은 성공 목록에 [돋보기] → S13 직접 찾기 줄로 둔다(저장 수에는 빠진다).
 * 식별 불가(언급 없음): [장소 직접 검색하기] → S13.
 * 그룹 즐겨찾기에서 시작(S20)은 S20 화면이 생기면 붙인다
 */
export function ExtractResultScreen() {
  const params = useLocalSearchParams<{ jobId: string; tripId?: string; tripTitle?: string }>();
  const jobId = params.jobId;
  // S20 그룹 즐겨찾기에서 시작했으면 그 여행. 저장 위치를 묻지 않고 그 그룹에 저장한 뒤 S20으로 돌아간다
  const fromTripId = params.tripId || null;
  const fromTripTitle = params.tripTitle || '이 여행';
  const saveToTrip = useSavePlaces();
  const groupSaving = useRef(false);
  const insets = useSafeAreaInsets();
  const { query, timedOut } = useExtraction(jobId);
  const retry = useRetryExtraction();
  const sent = sentExtraction(jobId);

  // 뺀 언급 묶음과 사용자가 정한 장소(지점 고르기·S13 바꾸기·직접 찾기). key는 묶음 key
  // 찾은 장소를 목록에서 빼는 버튼을 없애서 뺀 것은 늘 없다. 규칙 함수는 그대로 쓴다
  const removed = NOTHING_REMOVED;
  // 이 작업을 기다린 시간(초). 단계 표시를 넘기는 데 쓴다(shownStep). 다시 시도로 작업이 바뀌면 처음부터 센다
  const [clock, setClock] = useState({ jobId, seconds: 0 });
  if (clock.jobId !== jobId) setClock({ jobId, seconds: 0 });
  const elapsed = clock.seconds * 1000;
  useEffect(() => {
    const timer = setInterval(() => setClock((c) => ({ ...c, seconds: c.seconds + 1 })), 1000);
    return () => clearInterval(timer);
  }, [jobId]);
  const [picks, setPicks] = useState<Record<string, GroupPick>>({});
  // 식별 불가에서 직접 고른 장소. 고르면 그 한 곳으로 성공 상태가 된다
  const [picked, setPicked] = useState<GroupPick | null>(null);
  // 지도 칸 크기. 범위를 지도 비율에 맞춰야 핀이 가운데 온다(extractRegion)
  const [mapSize, setMapSize] = useState<{ width: number; height: number } | null>(null);
  // 지점 고르기에서 라디오로 고른 것. 묶음이 바뀌면 첫 지점부터
  const [choice, setChoice] = useState<{ group: string; index: number } | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const data = query.data;
  const view = picked ? 'success' : data ? extractionView(data, timedOut) : null;
  // 시간이 지나 처리 실패로 본 작업(서버에서는 아직 진행 중)
  const stuck = timedOut && (data?.job.status === 'QUEUED' || data?.job.status === 'RUNNING');
  const groups = groupCandidates(data?.candidates ?? []);
  // 지금 지점을 골라야 하는 언급. 없으면 성공 목록
  const asking = view === 'multiple' ? nextToChoose(groups, picks, removed) : null;
  const ambiguous = groups.filter((g) => g.options.length > 1 && !removed.includes(g.key));
  const choiceIndex = asking && choice?.group === asking.key ? choice.index : 0;

  const items: ExtractItem[] = picked
    ? [{ key: PICKED_KEY, name: picked.place.name, place: picked.place, evidence: picked.evidence }]
    : extractItems(groups, picks, removed);
  // 지도에 올릴 수 있는(저장할) 줄. 번호는 이 순서다
  const placed = items.filter((i): i is ExtractItem & { place: Place } => i.place !== null);

  const pickFor = (key: string, pick: GroupPick) => {
    if (key === PICKED_KEY) setPicked(pick);
    else setPicks((p) => ({ ...p, [key]: pick }));
  };

  const choose = async (
    onPicked: (place: Place) => void,
    around?: Place,
    name?: string,
    query?: string,
  ) => {
    const place = await pickPlace({
      ...(around ? { near: { latitude: around.latitude, longitude: around.longitude } } : {}),
      // 못 찾은 이름에서 '본점' 같은 지점 표시를 떼고 검색칸에 넣는다. 이름이 없으면 받은 검색어(지역)를 넣는다
      ...(name ? { query: withoutBranch(name) } : query ? { query } : {}),
    });
    if (place) onPicked(place);
  };

  /** 그룹 즐겨찾기에서 시작했을 때 [OO 그룹에 저장]. 찾은 장소를 그 여행에 담고 S20으로 돌아간다 */
  const saveToGroup = () => {
    // 빠르게 두 번 누르면 다시 그리기 전이라 isPending이 아직 false라서 ref로 바로 막는다
    if (!fromTripId || groupSaving.current || placed.length === 0) return;
    groupSaving.current = true;
    saveToTrip.mutate(
      {
        placeIds: placed.map((i) => i.place.id),
        targets: [{ kind: 'trip', tripId: fromTripId }],
        memo: sent?.input.memo,
      },
      {
        onSuccess: () => {
          forgetExtraction(jobId);
          toast.success(placeSavedMessage(fromTripTitle));
          // S11·S12를 닫고 S11을 연 S20으로 돌아간다. S20이 스택에 없으면(앱을 다시 켬) 새로 연다
          router.dismissTo({
            pathname: '/trips/[tripId]/favorites',
            params: { tripId: fromTripId },
          });
        },
        onError: () => {
          groupSaving.current = false;
          toast.error('그룹에 저장하지 못했어요. 다시 시도해 주세요');
        },
      },
    );
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
        router.replace({
          pathname: '/saved/extract/[jobId]',
          params: fromTripId
            ? { jobId: next, tripId: fromTripId, tripTitle: params.tripTitle ?? '' }
            : { jobId: next },
        });
      },
      onError: (error) => {
        if (apiErrorCode(error) === 'AI_FEATURE_DISABLED') {
          toast.error(FEATURE_OFF_MESSAGE, {
            action: { label: '설정', onPress: () => router.push('/settings') },
          });
          return;
        }
        toast.error('다시 보내지 못했어요. 잠시 뒤 다시 시도해 주세요');
      },
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
          <SkeletonList style={styles.flex} />
        )}
      </View>
    );
  }

  if (view === 'progress') {
    const step = shownStep(data.job.progress, elapsed);
    return (
      <View style={styles.screen}>
        <Header title="장소 찾기" largeTitle />
        <View style={styles.progressBody}>
          <SourceChip link={sent?.link ?? null} captures={sent?.captureCount ?? 0} flat />
          <View style={styles.progressTexts}>
            <Text style={[typography.title1, styles.text]}>장소를 찾고 있어요</Text>
            <Text style={[typography.caption, styles.sub]}>잠시만 기다려 주세요</Text>
          </View>
          <ExtractSteps
            steps={EXTRACTION_STEPS}
            current={step}
            detail={stepDetail(step, sent)}
            guides={EXTRACTION_STEP_GUIDES}
          />
        </View>
        <View style={[styles.progressBottom, { paddingBottom: Math.max(insets.bottom + 12, 34) }]}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="취소"
            disabled={cancelling}
            onPress={() => void cancel()}
            style={({ pressed }) => [styles.cancel, (pressed || cancelling) && styles.pressed]}
          >
            <Icon name="close" size={20} color={colors.text.icon} />
          </PressableScale>
        </View>
      </View>
    );
  }

  if (view === 'notFound' || view === 'failed') {
    const failed = view === 'failed';
    const notice = failedNotice(sent, failCause(data, timedOut));
    const missing = notFoundNotice(data?.regionHint);
    return (
      <View style={styles.screen}>
        <Header title="장소 찾기" largeTitle />
        <CenterNotice
          icon={failed ? notice.icon : 'search'}
          title={failed ? notice.title : '장소를 알아내지 못했어요'}
          description={failed ? notice.description : missing.description}
          actionLabel={failed ? '다시 시도' : missing.actionLabel}
          actionIcon={failed ? 'refresh' : 'search'}
          actionLoading={retry.isPending}
          onAction={
            failed
              ? tryAgain
              : () =>
                  void choose(
                    (place) => setPicked({ place, evidence: PICKED }),
                    undefined,
                    undefined,
                    missing.query,
                  )
          }
        />
      </View>
    );
  }

  const multiple = asking !== null;
  const options = asking?.options ?? [];
  const region = mapSize
    ? extractRegion(
        multiple ? options.map((o) => o.place) : placed.map((i) => i.place),
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
          <FittedMap region={region}>
            {asking
              ? options.map((o, i) => (
                  <MapMarker
                    key={o.candidateId}
                    latitude={o.place.latitude}
                    longitude={o.place.longitude}
                    label={`${candidateLetter(i)} ${o.place.name}`}
                    dot="brand"
                    highlighted={i === choiceIndex}
                    zIndex={i === choiceIndex ? 1 : 0}
                    onPress={() => setChoice({ group: asking.key, index: i })}
                  />
                ))
              : placed.map((item, i) => (
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
          </FittedMap>
        ) : null}
        <View style={styles.chipWrap} pointerEvents="none">
          <SourceChip link={sent?.link ?? null} captures={sent?.captureCount ?? 0} />
        </View>
      </View>

      <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom + 12, 34) }]}>
        <View style={styles.handle} />
        {asking ? (
          <>
            <View style={styles.titles}>
              <Text style={[typography.title1, styles.text]}>어느 곳인가요?</Text>
              <View style={styles.inline}>
                <Icon name="map-pin" size={16} color={colors.text.icon} />
                <Text style={[typography.caption, styles.sub]} numberOfLines={1}>
                  {`"${asking.name}" 같은 이름이 ${options.length}곳 있어요`}
                  {ambiguous.length > 1
                    ? ` · ${ambiguous.findIndex((g) => g.key === asking.key) + 1}/${ambiguous.length}`
                    : ''}
                </Text>
              </View>
            </View>
            <ScrollView
              decelerationRate={SCROLL_DECELERATION}
              style={styles.list}
              contentContainerStyle={styles.candidates}
              accessibilityRole="radiogroup"
            >
              {options.map((o, i) => {
                const selected = i === choiceIndex;
                return (
                  <PressableScale
                    key={o.candidateId}
                    accessibilityRole="radio"
                    accessibilityLabel={[candidateLetter(i), o.place.name, areaOf(o.place)]
                      .filter(Boolean)
                      .join(', ')}
                    accessibilityState={{ checked: selected }}
                    onPress={() => setChoice({ group: asking.key, index: i })}
                    style={[styles.candidate, selected && styles.candidateOn]}
                  >
                    <View style={[styles.letter, selected && styles.letterOn]}>
                      <Text style={[typography.captionBold, styles.inverse]}>
                        {candidateLetter(i)}
                      </Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={[typography.bodyBold, styles.text]} numberOfLines={1}>
                        {o.place.name}
                      </Text>
                      {areaOf(o.place) ? (
                        <View style={styles.inline}>
                          <Icon name="map-pin" size={16} color={colors.text.icon} />
                          <Text style={[typography.caption, styles.sub]} numberOfLines={1}>
                            {areaOf(o.place)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={[styles.radio, selected && styles.radioOn]}>
                      {selected ? <View style={styles.radioDot} /> : null}
                    </View>
                  </PressableScale>
                );
              })}
            </ScrollView>
            <View style={styles.buttons}>
              <Button
                label="여기에 없어요"
                icon="search"
                variant="text"
                onPress={() =>
                  void choose(
                    (place) => pickFor(asking.key, { place, evidence: PICKED }),
                    options[choiceIndex]?.place,
                    asking.name,
                  )
                }
                style={styles.notHere}
              />
              <Button
                label="이곳으로"
                icon="check"
                weight="medium"
                onPress={() => {
                  const o = options[choiceIndex];
                  if (o) pickFor(asking.key, { place: o.place, evidence: o.evidence });
                }}
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.titles}>
              <Text style={[typography.title1, styles.text]}>
                {placed.length > 0
                  ? `장소 ${placed.length}곳을 찾았어요`
                  : items.length > 0
                    ? '지도에서 찾지 못했어요'
                    : '저장할 장소가 없어요'}
              </Text>
              <Text style={[typography.caption, styles.sub]}>
                {placed.length > 0
                  ? fromTripId
                    ? `${fromTripTitle} 그룹 즐겨찾기에서 시작했어요`
                    : '확인하고 저장해 주세요'
                  : items.length > 0
                    ? '직접 골라 주세요'
                    : '다시 찾으려면 뒤로 가 주세요'}
              </Text>
            </View>
            <ScrollView
              decelerationRate={SCROLL_DECELERATION}
              style={styles.list}
              contentContainerStyle={styles.rows}
            >
              {items.map((item) => {
                const itemPlace = item.place;
                return (
                  <PressableScale
                    key={item.key}
                    disabled={!itemPlace}
                    onPress={() => setFocused(item.key)}
                    style={[styles.row, item.key === focused && styles.rowFocused]}
                  >
                    <View style={[styles.number, !itemPlace && styles.numberMissing]}>
                      <Text style={[typography.label, styles.inverse]}>
                        {itemPlace ? placed.findIndex((p) => p.key === item.key) + 1 : '?'}
                      </Text>
                    </View>
                    <View style={styles.rowTexts}>
                      <Text style={[typography.bodyBold, styles.text]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {itemPlace ? (
                        areaOf(itemPlace) ? (
                          <View style={styles.inline}>
                            <Icon name="map-pin" size={16} color={colors.text.icon} />
                            <Text style={[typography.caption, styles.sub]} numberOfLines={1}>
                              {areaOf(itemPlace)}
                            </Text>
                          </View>
                        ) : null
                      ) : (
                        <View style={styles.inline}>
                          <Icon name="search" size={16} color={colors.text.icon} />
                          <Text style={[typography.caption, styles.sub]} numberOfLines={1}>
                            지도에서 찾지 못했어요
                          </Text>
                        </View>
                      )}
                      {item.evidence ? (
                        <View style={styles.inline}>
                          <Icon name="bulb" size={16} color={colors.brand.primaryDark} />
                          <Text style={[typography.caption, styles.dark]} numberOfLines={2}>
                            {item.evidence}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {/* 찾은 장소에는 버튼을 두지 않는다. 확인하고 저장만 하면 된다(2026-11-14 사용자 결정).
                        지도에서 못 찾은 장소만 직접 찾는 버튼을 둔다. 이게 없으면 그 장소는 저장할 길이 없다 */}
                    {itemPlace ? null : (
                      <RoundButton
                        icon="search"
                        label={`${item.name} 직접 찾기`}
                        onPress={() =>
                          void choose(
                            (place) => pickFor(item.key, { place, evidence: PICKED }),
                            undefined,
                            item.name,
                          )
                        }
                      />
                    )}
                  </PressableScale>
                );
              })}
            </ScrollView>
            {fromTripId ? (
              // 그룹 즐겨찾기에서 시작: 저장 위치를 묻지 않고 그 그룹에 바로 저장한다(S12 값 문서)
              <View style={styles.groupSaveBox}>
                <Button
                  // 공통 버튼은 아이콘을 주면 글자를 숨긴다. 어느 그룹에 담는지 보여야 해서 글자로 쓴다
                  label={`${fromTripTitle} 그룹에 저장`}
                  size="lg"
                  block
                  disabled={placed.length === 0}
                  loading={saveToTrip.isPending}
                  onPress={saveToGroup}
                />
              </View>
            ) : (
              <View style={styles.buttons}>
                <Button
                  // 책갈피 아이콘만으로는 저장인지 알기 어려워 글자로 쓴다. 여러 곳이면 몇 곳인지도 붙인다
                  label={placed.length > 1 ? `${placed.length}곳 저장` : '저장'}
                  weight="medium"
                  disabled={placed.length === 0}
                  onPress={() => setSaveOpen(true)}
                />
              </View>
            )}
          </>
        )}
      </View>

      <PlaceSaveSheet
        visible={saveOpen}
        places={placed.map((i) => ({ id: i.place.id, name: i.name }))}
        initialChoice="personal"
        memo={sent?.input.memo}
        // 개인 저장이면 아래에서 S10으로 데려가 완료 안내에 [보기]를 붙이지 않는다
        opensSavedTab
        onClose={() => setSaveOpen(false)}
        onSaved={(target) => {
          forgetExtraction(jobId);
          // S11·S12를 닫고 개인이면 S10, 그룹이면 그 여행의 S20 그룹 즐겨찾기로(S08 값 문서). 뒤로 가면 여행 상세
          if (router.canDismiss()) router.dismissAll();
          if (target.kind === 'trip') {
            router.push({ pathname: '/trips/[tripId]', params: { tripId: target.tripId } });
            router.push({
              pathname: '/trips/[tripId]/favorites',
              params: { tripId: target.tripId },
            });
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
  icon: 'pencil' | 'close' | 'search';
  label: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.round, pressed && styles.pressed]}
    >
      <Icon name={icon} size={18} color={colors.text.icon} />
    </PressableScale>
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
  // 시트 제목과 설명 사이 2(성공·복수 후보)
  titles: { gap: spacing[2] },
  list: { flexGrow: 0, maxHeight: 280, marginTop: spacing[16] },
  // 값 문서: 장소 줄 위 여백 20(목록 위 16 + 4), 줄 사이 24
  rows: { gap: spacing[24], paddingTop: spacing[4] },
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
  // 지도에서 못 찾아 아직 장소가 없는 줄
  numberMissing: { backgroundColor: colors.text.sub2 },
  rowTexts: { flex: 1, gap: spacing[8] },

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
  // 그룹 즐겨찾기에서 시작: 연회색 상자 안 가로 꽉 찬 주 버튼(S12 값 문서)
  groupSaveBox: {
    marginTop: spacing[20],
    padding: spacing[16],
    borderRadius: radius.xxl,
    backgroundColor: colors.surface.subtle,
  },
  // 아이콘 옆에 곳 수가 붙는 알약이라 좌우 여백을 둔다
});
