import { SCROLL_DECELERATION } from '@/theme/scroll';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  View,
} from 'react-native';
import { Spinner } from '@/components/ui/spinner';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorState, Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { caret, colors, layout, radius, spacing, typography } from '@/theme';

import { searchPlaces } from '../api';
import { cancelPickOnLeave, finishPick, handOffPick } from '../place-picker';
import { QUERY_MAX_LENGTH, normalizeQuery, searchFailure } from '../place-rules';
import type { Place } from '../types';

/** 글자를 멈추고 이만큼 지나면 검색한다 */
const DEBOUNCE_MS = 300;

/**
 * S13 장소 직접 검색·지정 · 검색. 다른 화면이 pickPlace()로 연다.
 * 상태: 검색 결과 / 검색 결과 없음 / 검색 오래 걸림(시간 초과·공급자 장애). 지도에서 고르기는 place-pick-screen.
 * 고르면 부른 화면에 장소를 돌려주고 닫힌다. 뒤로 나가면 null.
 */
export function PlaceSearchScreen() {
  const params = useLocalSearchParams<{ regionId?: string; lat?: string; lng?: string }>();
  const [text, setText] = useState('');
  const [query, setQuery] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(normalizeQuery(text)), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  // 화면을 닫으면(뒤로·고르기) 부른 화면의 약속을 끝낸다. 지도로 넘길 때는 이어 간다
  useEffect(() => cancelPickOnLeave, []);

  // 부른 화면이 근처 좌표를 줬으면 서버가 그곳에서 가까운 순으로 준다
  const near =
    params.lat && params.lng
      ? { latitude: Number(params.lat), longitude: Number(params.lng) }
      : null;
  const search = useQuery({
    queryKey: [
      'places',
      'search',
      query,
      params.regionId ?? null,
      params.lat ?? null,
      params.lng ?? null,
    ],
    queryFn: ({ signal }) => searchPlaces(query!, { regionId: params.regionId, near, signal }),
    enabled: query !== null,
    retry: false,
    staleTime: 60_000,
  });

  const choose = (place: Place) => {
    finishPick(place);
    router.back();
  };

  const openMap = () => {
    handOffPick();
    router.replace({
      pathname: '/places/pick',
      params: {
        ...(params.regionId ? { regionId: params.regionId } : {}),
        ...(params.lat && params.lng ? { lat: params.lat, lng: params.lng } : {}),
      },
    });
  };

  const failure = search.isError ? searchFailure(search.error) : null;
  const results = search.data ?? [];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="뒤로"
          onPress={() => router.back()}
          style={styles.back}
        >
          <Icon name="back" size={24} color={colors.text.default} />
        </PressableScale>
        <View style={[styles.search, focused && styles.searchFocused]}>
          <View style={styles.searchIcon} pointerEvents="none">
            <Icon name="search" size={20} color={colors.text.sub} />
          </View>
          <TextInput
            {...caret}
            value={text}
            onChangeText={setText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="장소 이름으로 찾기"
            placeholderTextColor={colors.text.muted}
            maxLength={QUERY_MAX_LENGTH}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={() => setQuery(normalizeQuery(text))}
            accessibilityLabel="장소 검색"
            style={styles.searchInput}
          />
          {text ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="지우기"
              onPress={() => setText('')}
              style={styles.clear}
            >
              <Icon name="close" size={14} color={colors.text.inverse} />
            </PressableScale>
          ) : null}
        </View>
      </View>

      {failure === 'slow' ? (
        <Notice
          icon="clock"
          title="검색이 오래 걸려 멈췄어요"
          description="검색이 오래 걸려요"
          primary={<Button label="다시 검색" icon="refresh" onPress={() => search.refetch()} />}
          onMap={openMap}
          mapAsText
        />
      ) : failure === 'error' ? (
        <ErrorState
          title="장소를 찾지 못했어요"
          retryLabel="다시 검색"
          onRetry={() => search.refetch()}
        />
      ) : query && search.isSuccess && results.length === 0 ? (
        <Notice
          icon="search"
          title="검색 결과가 없어요"
          description="지도에서 직접 골라 주세요"
          primary={<Button label="지도에서 고르기" icon="map" onPress={openMap} />}
        />
      ) : (
        <FlatList
          decelerationRate={SCROLL_DECELERATION}
          data={query ? results : []}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <PressableScale
                accessibilityLabel="지도에서 직접 고르기"
                accessibilityRole="button"
                onPress={openMap}
                style={({ pressed }) => [styles.mapCard, pressed && styles.pressed]}
              >
                <View style={styles.mapCardIcon}>
                  <Icon name="map" size={20} color={colors.brand.primary} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[typography.bodyBold, styles.name]}>지도에서 직접 고르기</Text>
                  <Text style={[typography.caption, styles.address]}>
                    검색에 없으면 지도에서 짚어요
                  </Text>
                </View>
                <Icon name="chevron-right" size={18} color={colors.text.muted} />
              </PressableScale>
              {query && search.isFetching && !search.data ? (
                <Spinner style={styles.loading} color={colors.brand.primary} />
              ) : query && results.length ? (
                <Text style={[typography.captionMedium, styles.count]}>
                  검색 결과 {results.length}곳
                </Text>
              ) : null}
            </View>
          }
          renderItem={({ item }) => <PlaceRow place={item} onPress={() => choose(item)} />}
        />
      )}
    </SafeAreaView>
  );
}

function PlaceRow({ place, onPress }: { place: Place; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${place.name}${place.address ? `, ${place.address}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowIcon}>
        <Icon name="map-pin" size={20} color={colors.text.icon} />
      </View>
      <View style={styles.rowText}>
        <Text style={[typography.bodyBold, styles.name]} numberOfLines={1}>
          {place.name}
        </Text>
        {place.address ? (
          <Text style={[typography.caption, styles.address]} numberOfLines={1}>
            {place.address}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

/** 가운데 안내 화면(결과 없음·오래 걸림). 회색 동그라미 아이콘 + 제목 + 설명 + 버튼 */
function Notice({
  icon,
  title,
  description,
  primary,
  onMap,
  mapAsText = false,
}: {
  icon: 'search' | 'clock';
  title: string;
  description: string;
  primary: React.ReactNode;
  onMap?: () => void;
  mapAsText?: boolean;
}) {
  return (
    <View style={styles.notice}>
      <View style={styles.noticeIcon}>
        <Icon name={icon} size={24} color={colors.text.icon} />
      </View>
      <Text style={[typography.title2, styles.name, styles.centerText]}>{title}</Text>
      <Text style={[typography.body, styles.address, styles.centerText]}>{description}</Text>
      <View style={styles.noticeActions}>
        {primary}
        {mapAsText && onMap ? (
          <PressableScale
            accessibilityLabel="지도에서 고르기"
            accessibilityRole="button"
            onPress={onMap}
            style={({ pressed }) => [styles.textLink, pressed && styles.pressed]}
          >
            <Icon name="map" size={18} color={colors.text.icon} />
            <Text style={[typography.subBold, styles.address]}>지도에서 고르기</Text>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}

// 다른 입력 칸(TextField 48)과 맞춘다. 40은 11/09 직접 확인에서 너무 낮다고 했다
const SEARCH_HEIGHT = 48;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing[8],
    paddingRight: layout.screenPaddingX,
    gap: spacing[6],
  },
  back: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    flex: 1,
    height: SEARCH_HEIGHT,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  // 피그마: 입력 중이면 연파랑 4px 테두리 빛(spread 4). 토큰 테두리 색으로 비슷하게 맞춘다
  searchFocused: { borderColor: colors.brand.primaryLight },
  searchIcon: { position: 'absolute', left: spacing[12] },
  // 안드로이드에서 한글이 칸 가운데 오게 TextField와 같이 맞춘다: lineHeight를 주지 않고(주면 위로 붙거나 잘림)
  // 글꼴 위아래 여유를 빼고 세로 가운데 정렬
  searchInput: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    includeFontPadding: false,
    textAlignVertical: 'center',
    color: colors.text.default,
    paddingLeft: 40,
    paddingRight: 40,
    paddingVertical: 0,
    height: SEARCH_HEIGHT - 4,
    // 웹 미리보기의 브라우저 기본 포커스 테두리를 지운다(TextField와 같은 처리). 입력 중 표시는 바깥 테두리 색
    ...((Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as TextStyle),
  },
  clear: {
    position: 'absolute',
    right: spacing[6],
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    paddingBottom: spacing[24],
  },
  listHeader: { gap: spacing[20] },
  // 검색 결과 줄과 같은 모양(동그라미 아이콘 + 두 줄 글). 얇은 테두리로 감싸 결과와 다른 "다른 방법"임을 알린다
  mapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    paddingVertical: spacing[12],
    paddingLeft: spacing[14],
    paddingRight: spacing[12],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line.default,
    backgroundColor: colors.surface.white,
  },
  mapCardIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { color: colors.text.icon, paddingBottom: spacing[4] },
  loading: { marginTop: spacing[24] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[18],
    paddingVertical: spacing[12],
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  name: { color: colors.text.default },
  address: { color: colors.text.icon },
  pressed: { opacity: 0.7 },
  notice: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 110,
    gap: spacing[8],
  },
  noticeIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[12],
  },
  centerText: { textAlign: 'center' },
  noticeActions: { alignItems: 'center', gap: spacing[12], marginTop: spacing[16] },
  textLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    paddingVertical: spacing[10],
    paddingHorizontal: spacing[12],
  },
});
