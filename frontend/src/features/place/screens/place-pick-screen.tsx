import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CenterPin, KOREA_REGION, MapHint, MapView } from '@/components/map';
import { Button, Header, Icon, TextField, toast } from '@/components/ui';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { createManualPlace } from '../api';
import { cancelPickOnLeave, finishPick } from '../place-picker';
import { PLACE_NAME_MAX_LENGTH, formatCoord, normalizePlaceName } from '../place-rules';

/** 처음 가운데가 정해진 경우 보여 줄 범위(동네 한두 개) */
const NEAR_DELTA = 0.03;

/**
 * S13 장소 직접 검색·지정 · 지도에서 고르기. 지도를 움직여 가운데 핀에 위치를 맞추고 이름을 적는다.
 * [이 위치로] → POST /places(수동 장소) → 부른 화면에 돌려준다.
 *
 * 주소는 좌표로 주소를 찾는 API가 아직 명세에 없어 좌표로 보여 준다. 생기면 바꾼다.
 */
export function PlacePickScreen() {
  const params = useLocalSearchParams<{ regionId?: string; lat?: string; lng?: string }>();
  const insets = useSafeAreaInsets();
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

  useEffect(() => cancelPickOnLeave, []);

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
    setTouched(true);
    if (valid) save.mutate();
  };

  return (
    <View style={styles.screen}>
      <Header title="위치 고르기" />
      <View style={styles.mapArea}>
        <MapView
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
          onCameraIdle={({ latitude, longitude }) => setCenter({ latitude, longitude })}
        />
        <CenterPin />
        <View style={styles.hint} pointerEvents="none">
          <MapHint text="지도를 움직여 위치를 맞춰 주세요" />
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing[24]) }]}>
          <View style={styles.handle} />
          <View style={styles.titleBlock}>
            <Text style={[typography.title1, styles.text]}>이 위치가 맞나요?</Text>
            <View style={styles.coordRow}>
              <Icon name="map-pin" size={16} color={colors.text.icon} />
              <Text style={[typography.caption, styles.sub]}>
                지도 가운데 · {formatCoord(center.latitude, center.longitude)}
              </Text>
            </View>
          </View>
          <TextField
            label="장소 이름"
            variant="filled"
            value={name}
            onChangeText={setName}
            placeholder="예: 민락 수변공원"
            maxLength={PLACE_NAME_MAX_LENGTH}
            hideCount
            boxStyle={styles.nameBox}
            error={touched && !valid ? '장소 이름을 적어 주세요' : undefined}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          <View style={styles.actions}>
            <Button
              label="이 위치로"
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
  hint: { position: 'absolute', top: spacing[16], left: 0, right: 0 },
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
  coordRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
  nameBox: { minHeight: 52 },
  actions: { alignItems: 'flex-end', paddingTop: spacing[4] },
  // 공통 Button은 스스로 왼쪽에 붙어서(alignSelf) 오른쪽으로 다시 보낸다(피그마: 오른쪽 정렬)
  submit: { alignSelf: 'flex-end' },
});
