import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CenterPin, KOREA_REGION, MapHint, MapView, type MapViewRef } from '@/components/map';
import { Button, Header, Icon, TextField, toast } from '@/components/ui';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { createManualPlace, searchPlaces } from '../api';
import { cancelPickOnLeave, finishPick } from '../place-picker';
import {
  PLACE_NAME_MAX_LENGTH,
  QUERY_MAX_LENGTH,
  distanceLabel,
  distanceMeters,
  normalizePlaceName,
  normalizeQuery,
  rankNear,
  shortAddress,
} from '../place-rules';
import type { Place } from '../types';

/** 처음 가운데가 정해진 경우 보여 줄 범위(동네 한두 개) */
const NEAR_DELTA = 0.03;
/** 검색 결과를 눌렀을 때 맞출 확대(골목이 보이는 정도) */
const PICK_ZOOM = 16;
const DEBOUNCE_MS = 300;
/** 고른 결과에서 이만큼 넘게 지도를 옮기면 그 장소 주소를 지운다(다른 위치가 됐으므로) */
const MOVED_METERS = 40;
const SEARCH_HEIGHT = 48;

/**
 * S13 장소 직접 검색·지정 · 지도에서 고르기. 지도를 움직여 가운데 핀에 위치를 맞추고 이름을 적는다.
 * 위쪽 검색칸에서 장소를 찾으면(GET /places, 공공 장소) 지도 가운데에서 가까운 순으로 보이고,
 * 누르면 지도가 그곳으로 가고 이름이 채워지며 [이 장소로] → 그 장소를 그대로 돌려준다(같은 장소를 또 만들지 않음).
 * 그 뒤 지도를 옮기면 직접 고르는 위치가 되어 자동으로 채운 이름·주소를 지우고 [이 위치로] → POST /places(수동 장소).
 * 검색에 안 나오는 곳(골목 가게 등)을 위한 화면이라, 검색은 근처로 데려다 주고 마지막 위치는 가운데 핀으로 정한다.
 *
 * 서버가 가까운 순(near)과 장소 종류를 아직 주지 않아, 받은 결과 안에서만 가까운 순으로 줄 세우고
 * 종류 아이콘 대신 위치 아이콘을 쓴다. 위도·경도 숫자는 사람이 읽을 값이 아니라서 보이지 않는다
 */
export function PlacePickScreen() {
  const params = useLocalSearchParams<{ regionId?: string; lat?: string; lng?: string }>();
  const insets = useSafeAreaInsets();
  const map = useRef<MapViewRef>(null);
  const start =
    params.lat && params.lng
      ? { latitude: Number(params.lat), longitude: Number(params.lng) }
      : {
          latitude: KOREA_REGION.latitude + KOREA_REGION.latitudeDelta / 2,
          longitude: KOREA_REGION.longitude + KOREA_REGION.longitudeDelta / 2,
        };
  const [center, setCenter] = useState(start);
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const valid = normalizePlaceName(name);

  const [text, setText] = useState('');
  const [query, setQuery] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  /** 검색 결과에서 고른 장소. 주소를 보여 주고 [이 장소로]로 그대로 돌려준다. 지도를 멀리 옮기면 지운다 */
  const [picked, setPicked] = useState<Place | null>(null);
  /** 이름 칸을 고른 장소 이름으로 자동으로 채웠는지(직접 고쳐 쓰면 false). 지도를 옮길 때 자동 이름만 지운다 */
  const [nameAuto, setNameAuto] = useState(false);
  /**
   * 결과를 눌러 지도가 그곳으로 가는 중. 가는 도중 멈춤 알림(한 번)과 도착 알림은 "사용자가 옮겼다"로 보지 않는다
   */
  const arriving = useRef(false);

  useEffect(() => cancelPickOnLeave, []);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(normalizeQuery(text)), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const search = useQuery({
    queryKey: ['places', 'search', query],
    queryFn: ({ signal }) => searchPlaces(query ?? '', { signal }),
    enabled: query !== null,
  });
  const results = query && search.data ? rankNear(search.data, query, center) : [];

  const choose = (place: Place) => {
    Keyboard.dismiss();
    setSearchOpen(false);
    setPicked(place);
    setName(place.name);
    setNameAuto(true);
    setTouched(false);
    setText(place.name);
    arriving.current = true;
    map.current?.animateCameraTo({
      latitude: place.latitude,
      longitude: place.longitude,
      zoom: PICK_ZOOM,
      duration: 500,
    });
  };

  const save = useMutation({
    mutationFn: () =>
      createManualPlace({
        name: valid!,
        latitude: center.latitude,
        longitude: center.longitude,
        ...(params.regionId ? { regionId: params.regionId } : {}),
      }),
    onSuccess: (place) => {
      finishPick(place);
      router.back();
    },
    onError: () =>
      toast.error('장소를 만들지 못했어요', {
        action: { label: '다시 시도', onPress: () => save.mutate() },
      }),
  });

  const submit = () => {
    // 검색에서 고른 곳 그대로면 그 장소를 돌려준다(새로 만들지 않는다)
    if (picked) {
      finishPick(picked);
      router.back();
      return;
    }
    setTouched(true);
    if (valid) save.mutate();
  };

  const showResults = searchOpen && query !== null;
  const address = picked ? shortAddress(picked.address) : null;

  return (
    <View style={styles.screen}>
      <Header title="위치 고르기" />
      <View style={styles.mapArea}>
        <MapView
          ref={map}
          initialRegion={
            params.lat && params.lng
              ? {
                  latitude: start.latitude - NEAR_DELTA / 2,
                  longitude: start.longitude - NEAR_DELTA / 2,
                  latitudeDelta: NEAR_DELTA,
                  longitudeDelta: NEAR_DELTA,
                }
              : undefined
          }
          onCameraIdle={({ latitude, longitude }) => {
            const next = { latitude, longitude };
            setCenter(next);
            if (arriving.current) {
              arriving.current = false;
              return;
            }
            if (picked && distanceMeters(picked, next) > MOVED_METERS) {
              setPicked(null);
              if (nameAuto) {
                setName('');
                setNameAuto(false);
              }
            }
          }}
        />
        <CenterPin />

        <View style={styles.searchWrap} pointerEvents="box-none">
          <View style={styles.search}>
            <View style={styles.searchIcon} pointerEvents="none">
              <Icon name="search" size={20} color={colors.text.sub} />
            </View>
            <TextInput
              value={text}
              onChangeText={(v) => {
                setText(v);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              placeholder="장소 이름으로 찾아가기"
              placeholderTextColor={colors.text.muted}
              maxLength={QUERY_MAX_LENGTH}
              returnKeyType="search"
              onSubmitEditing={() => setQuery(normalizeQuery(text))}
              accessibilityLabel="지도에서 장소 찾기"
              style={styles.searchInput}
            />
            {text ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="지우기"
                onPress={() => {
                  setText('');
                  setQuery(null);
                }}
                style={styles.clear}
              >
                <Icon name="close" size={14} color={colors.text.inverse} />
              </Pressable>
            ) : null}
          </View>

          {showResults ? (
            <View style={styles.results}>
              {search.isFetching && results.length === 0 ? (
                <ActivityIndicator color={colors.brand.primary} style={styles.resultsNote} />
              ) : search.isError ? (
                <Text style={[styles.noteText, styles.resultsNote]}>
                  찾지 못했어요. 다시 시도해 주세요
                </Text>
              ) : results.length === 0 ? (
                <Text style={[styles.noteText, styles.resultsNote]}>
                  찾는 곳이 없으면 지도를 움직여 핀을 맞춰 주세요
                </Text>
              ) : (
                <ScrollView keyboardShouldPersistTaps="handled" style={styles.resultsScroll}>
                  {results.map(({ place, meters }) => (
                    <Pressable
                      key={place.id}
                      onPress={() => choose(place)}
                      style={({ pressed }) => [styles.result, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel={`${place.name}, ${shortAddress(place.address) ?? ''}, ${distanceLabel(meters)}`}
                    >
                      <Icon name="map-pin" size={18} color={colors.text.icon} />
                      <View style={styles.resultText}>
                        <Text style={styles.resultName} numberOfLines={1}>
                          {place.name}
                        </Text>
                        {place.address ? (
                          <Text style={styles.resultSub} numberOfLines={1}>
                            {shortAddress(place.address)}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={styles.resultDistance}>{distanceLabel(meters)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : (
            <View style={styles.hint} pointerEvents="none">
              <MapHint text="지도를 움직여 위치를 맞춰 주세요" />
            </View>
          )}
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing[24]) }]}>
          <View style={styles.handle} />
          <View style={styles.titleBlock}>
            <Text style={[typography.title1, styles.text]}>이 위치가 맞나요?</Text>
            {address ? (
              <View style={styles.addressRow}>
                <Icon name="map-pin" size={16} color={colors.text.icon} />
                <Text style={[typography.caption, styles.sub]}>{address}</Text>
              </View>
            ) : null}
          </View>
          <TextField
            label="이 위치의 장소 이름"
            variant="filled"
            value={name}
            onChangeText={(v) => {
              setName(v);
              setNameAuto(false);
            }}
            placeholder={picked ? '예: 민락 수변공원' : '이 위치의 이름을 적어 주세요'}
            maxLength={PLACE_NAME_MAX_LENGTH}
            hideCount
            boxStyle={styles.nameBox}
            error={touched && !valid ? '장소 이름을 적어 주세요' : undefined}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          <View style={styles.actions}>
            <Button
              label={picked ? '이 장소로' : '이 위치로'}
              leading={<Icon name="check" size={20} color={colors.text.inverse} />}
              loading={save.isPending}
              onPress={submit}
              style={styles.submit}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  mapArea: { flex: 1, overflow: 'hidden' },
  searchWrap: {
    position: 'absolute',
    top: spacing[12],
    left: layout.screenPaddingX,
    right: layout.screenPaddingX,
    gap: spacing[8],
  },
  search: {
    height: SEARCH_HEIGHT,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  searchIcon: { position: 'absolute', left: spacing[14] },
  // 안드로이드에서 한글이 칸 가운데 오게 S13 검색칸·TextField와 같이 맞춘다
  searchInput: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    includeFontPadding: false,
    textAlignVertical: 'center',
    color: colors.text.default,
    height: SEARCH_HEIGHT,
    paddingLeft: 44,
    paddingRight: 44,
    paddingVertical: 0,
    ...((Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as TextStyle),
  },
  clear: {
    position: 'absolute',
    right: spacing[12],
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  results: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface.white,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  resultsScroll: { maxHeight: 280 },
  resultsNote: { paddingVertical: spacing[16], paddingHorizontal: spacing[16] },
  noteText: { ...typography.caption, color: colors.text.sub, textAlign: 'center' },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    paddingHorizontal: spacing[16],
    paddingVertical: spacing[12],
  },
  pressed: { backgroundColor: colors.surface.default },
  resultText: { flex: 1, minWidth: 0, gap: spacing[2] },
  resultName: { ...typography.bodyMedium, color: colors.text.default },
  resultSub: { ...typography.caption, color: colors.text.sub },
  resultDistance: { ...typography.caption, color: colors.text.icon },
  hint: { alignItems: 'center' },
  sheet: {
    marginTop: -radius.xxl,
    paddingHorizontal: layout.screenPaddingX,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    backgroundColor: colors.surface.white,
    gap: spacing[16],
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    marginTop: spacing[8],
    borderRadius: radius.full,
    backgroundColor: colors.gray[300],
  },
  titleBlock: { gap: spacing[2] },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
  nameBox: { minHeight: 52 },
  actions: { alignItems: 'flex-end', paddingTop: spacing[4] },
  // 공통 Button은 스스로 왼쪽에 붙어서(alignSelf) 오른쪽으로 다시 보낸다(피그마: 오른쪽 정렬)
  submit: { alignSelf: 'flex-end' },
});
