import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';

import { Avatar, BottomSheet, Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { assetSource } from '@/lib/asset-image';
import { colors, radius, spacing, typography } from '@/theme';

import { useSavedPlaceIds, useUnsavePlace } from '@/features/saved';

import { getPlace, getPlaceReviews, getPlaceSocial, type PlaceInfo, toPlaceInfo } from '../info';

export type PlaceInfoSheetViewProps = {
  visible: boolean;
  state: 'loading' | 'error' | 'ready';
  info?: PlaceInfo;
  /** 내 개인 즐겨찾기에 이미 있는 곳. 저장 버튼을 '저장한 곳' 모양으로 바꾸고, 누르면 해제한다 */
  saved?: boolean;
  onClose: () => void;
  onSave: () => void;
  onVisitors: () => void;
  onRetry: () => void;
};

/**
 * N7 장소 정보 시트(WD-FR-10). 홈 추천 장소·S07 장소 줄에서 연다.
 * [저장]을 눌러야 저장된다(결정 F-23). 저장은 S08 장소 저장 시트(B)가 맡는다
 */
export function PlaceInfoSheetView(props: PlaceInfoSheetViewProps) {
  const { info } = props;
  const src = assetSource(info?.photoUrl);
  return (
    <BottomSheet
      visible={props.visible}
      onClose={props.onClose}
      title={info?.name ?? '장소 정보'}
      titleVariant="title2"
    >
      {props.state === 'loading' ? (
        <Spinner color={colors.brand.primary} style={styles.loading} />
      ) : props.state === 'error' || !info ? (
        <View style={styles.error}>
          <Text style={styles.sub}>장소 정보를 불러오지 못했어요</Text>
          <PressableScale
            onPress={props.onRetry}
            style={styles.retry}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel="다시 시도"
          >
            <Icon name="refresh" size={18} color={colors.text.default} />
          </PressableScale>
        </View>
      ) : (
        <View style={styles.body}>
          {info.address ? (
            <View style={styles.row}>
              <Icon name="map-pin" size={14} color={colors.text.icon} />
              <Text style={styles.sub}>{info.address}</Text>
            </View>
          ) : null}
          <View style={styles.photo}>
            <Icon name="image" size={28} color={colors.brand.primary} />
            {src ? <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
          </View>
          {info.reason ? (
            <View style={styles.line}>
              {/* 좋아요에서 온 추천 이유. 홈 추천 시트 하트와 같은 코랄 레드 */}
              <Icon name="heart" size={18} color={colors.brand.accent} />
              <Text style={styles.lineText}>{info.reason}</Text>
            </View>
          ) : null}
          {/* 다녀간 친구 목록 화면이 아직 없어 누를 수 없는 글 한 줄로 둔다(화면이 생기면 [>]와 onVisitors를 붙인다) */}
          {info.visitorsLine ? (
            <View style={styles.line}>
              {info.firstVisitor ? <Avatar name={info.firstVisitor} size="sm" /> : null}
              <Text style={[styles.lineText, styles.flex]}>{info.visitorsLine}</Text>
            </View>
          ) : null}
          {info.score !== null ? (
            <View style={styles.line}>
              <Icon name="star" size={18} color={colors.text.default} filled />
              <Text style={styles.score}>{info.score.toFixed(1)}</Text>
              {info.review ? (
                <Text style={[styles.lineText, styles.flex]} numberOfLines={1}>
                  {info.review}
                </Text>
              ) : null}
            </View>
          ) : null}
          <View style={styles.saveRow}>
            {/* 이미 저장한 곳은 책갈피 색을 바꿔 알린다(글은 붙이지 않는다). 다시 누르면 저장을 해제한다 */}
            <PressableScale
              onPress={props.onSave}
              style={({ pressed }) => [
                styles.save,
                props.saved && styles.saveDone,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={props.saved ? `${info.name} 저장 해제` : `${info.name} 저장`}
            >
              <Icon
                name="bookmark"
                size={22}
                color={props.saved ? colors.brand.primary : colors.text.inverse}
                filled={props.saved}
              />
            </PressableScale>
          </View>
        </View>
      )}
    </BottomSheet>
  );
}

/**
 * 장소 ID만 받아 N7 시트를 띄운다. placeId가 있으면 열리고 null이면 닫힌다.
 * reason은 들어온 곳이 알려 준 이유("좋아요한 여행과 비슷해요")
 */
export function PlaceInfoSheet({
  placeId,
  reason,
  onClose,
  onSave,
  onVisitors,
}: {
  placeId: string | null;
  reason?: string | null;
  onClose: () => void;
  /** [저장]. S08 장소 저장 시트에 넘길 장소 id와 이름 */
  onSave: (place: { id: string; name: string }) => void;
  onVisitors?: (placeId: string) => void;
}) {
  // 닫히는 동안에도 내용이 남게 마지막 장소를 기억한다(placeId가 null이 되면 쿼리 키가 바뀌어 비던 것, !155 리뷰)
  const [lastId, setLastId] = useState(placeId);
  if (placeId && placeId !== lastId) setLastId(placeId);
  const id = placeId ?? lastId ?? '';
  const place = useQuery({
    queryKey: ['places', id],
    queryFn: () => getPlace(id),
    enabled: !!id,
  });
  const social = useQuery({
    queryKey: ['places', id, 'social'],
    queryFn: () => getPlaceSocial(id),
    enabled: !!id,
    retry: false,
  });
  const reviews = useQuery({
    queryKey: ['places', id, 'public-reviews'],
    queryFn: () => getPlaceReviews(id),
    enabled: !!id,
    retry: false,
  });
  const savedIds = useSavedPlaceIds();
  const unsave = useUnsavePlace();
  const saved = !!id && savedIds.has(id);
  const state = place.isError && !place.data ? 'error' : place.data ? 'ready' : 'loading';
  return (
    <PlaceInfoSheetView
      visible={!!placeId}
      state={state}
      info={
        place.data
          ? toPlaceInfo({ place: place.data, social: social.data, reviews: reviews.data, reason })
          : undefined
      }
      saved={saved}
      onClose={onClose}
      // 이미 저장한 곳이면 저장을 처음부터 다시 하지 않고 해제한다.
      // 안내와 [되돌리기]는 이 창 아래에 떠서 창이 열려 있으면 누를 수 없다. 그래서 창을 먼저 닫는다
      onSave={() => {
        if (saved) {
          onClose();
          unsave(id);
        } else if (place.data) onSave({ id: place.data.id, name: place.data.name });
      }}
      onVisitors={() => placeId && onVisitors?.(placeId)}
      onRetry={() => void place.refetch()}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  saveDone: { backgroundColor: colors.brand.primaryBg },
  loading: { marginVertical: spacing[32] },
  error: { alignItems: 'center', gap: spacing[10], paddingVertical: spacing[24] },
  retry: {
    height: 36,
    paddingHorizontal: spacing[16],
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
  },
  body: { gap: spacing[14] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[6], marginTop: -spacing[8] },
  sub: { ...typography.caption, color: colors.text.sub },
  photo: {
    height: 160,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.brand.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[4],
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing[10], minHeight: 28 },
  lineText: { ...typography.body, color: colors.text.default },
  score: { ...typography.bodyBold, color: colors.text.default },
  saveRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing[10],
    marginTop: spacing[4],
  },
  save: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
