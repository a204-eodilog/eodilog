import { useQueryClient } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, EmptyState, ErrorState, Header, Icon } from '@/components/ui';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { useNewTripDraft } from '../hooks/use-new-trip-draft';
import { primeRegion } from '../hooks/use-region-names';
import { useRegionSearch } from '../hooks/use-region-search';
import { shortRegionName } from '../trip-rules';
import type { Region } from '../types';

/** S16 "어디로" 줄에서 여는 여행지 검색. 여러 곳을 고를 수 있고 같은 곳은 한 번만 들어간다 */
export function RegionSearchScreen() {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState('');
  const { regions: picked, addRegion, removeRegion } = useNewTripDraft();
  const { regions, query, isFetching, isError, refetch, hasNextPage, fetchNextPage } =
    useRegionSearch(input);

  const pick = (region: Region) => {
    primeRegion(queryClient, region);
    addRegion(region);
  };

  return (
    <View style={styles.screen}>
      <Header title="여행지" />
      <View style={styles.searchBox}>
        <Icon name="search" size={20} color={colors.text.muted} />
        <TextInput
          autoFocus
          value={input}
          onChangeText={setInput}
          placeholder="지역 이름으로 찾아보세요"
          placeholderTextColor={colors.text.muted}
          returnKeyType="search"
          style={styles.input}
          accessibilityLabel="여행지 검색"
        />
      </View>

      {picked.length > 0 ? (
        <View style={styles.picked}>
          {picked.map((r) => (
            <Chip
              key={r.id}
              label={`${shortRegionName(r.name)} ✕`}
              selected
              onPress={() => removeRegion(r.id)}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.list}>
        {query.length === 0 ? (
          <EmptyState
            icon="map-pin"
            title="어디로 떠날까요?"
            description="시·군·구 이름을 입력해 보세요"
          />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !isFetching && regions.length === 0 ? (
          <EmptyState
            icon="search"
            title="찾는 지역이 없어요"
            description="다른 이름으로 찾아보세요"
          />
        ) : (
          <FlashList
            data={regions}
            keyExtractor={(r) => r.id}
            keyboardShouldPersistTaps="handled"
            onEndReached={() => hasNextPage && fetchNextPage()}
            renderItem={({ item }) => {
              const selected = picked.some((p) => p.id === item.id);
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => (selected ? removeRegion(item.id) : pick(item))}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <Icon name="map-pin" size={20} color={colors.text.sub} />
                  <View style={styles.rowText}>
                    <Text style={[typography.bodyMedium, styles.name]}>
                      {shortRegionName(item.name)}
                    </Text>
                    <Text style={[typography.caption, styles.full]}>{item.name}</Text>
                  </View>
                  {selected ? <Icon name="check" size={20} color={colors.brand.primary} /> : null}
                </Pressable>
              );
            }}
          />
        )}
      </View>

      {/* 안드로이드 하단 버튼 줄(내비게이션 바) 높이에 16을 더 띄운다. 바 높이만 주면 버튼이 바에 붙는다 */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing[16] }]}>
        <Button
          label={picked.length > 0 ? `${picked.length}곳 고르기` : '완료'}
          size="xl"
          block
          onPress={() => router.back()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    marginHorizontal: layout.screenPaddingX,
    paddingHorizontal: spacing[12],
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface.default,
  },
  // lineHeight를 주면 안드로이드에서 글자 위아래가 잘린다(TextField와 같은 이유)
  input: {
    flex: 1,
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    color: colors.text.default,
    paddingVertical: 0,
    // 글꼴 여유 공간을 빼고 세로 가운데. 검색칸(48) 안에 맞게 들어간다(TextField와 같은 이유)
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  picked: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[8],
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[12],
  },
  list: { flex: 1, marginTop: spacing[8] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    paddingHorizontal: layout.screenPaddingX,
    minHeight: 60,
  },
  pressed: { backgroundColor: colors.surface.subtle },
  rowText: { flex: 1 },
  name: { color: colors.text.default },
  full: { color: colors.text.muted },
  footer: { paddingHorizontal: layout.screenPaddingX, paddingTop: spacing[16] },
});
