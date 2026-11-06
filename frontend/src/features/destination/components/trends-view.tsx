import { Image } from 'expo-image';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorState, Header, Icon, type IconName } from '@/components/ui';
import { assetSource } from '@/lib/asset-image';
import { colors, layout, radius, spacing, typography } from '@/theme';

import type { TrendBoard, TrendRow } from '../types';

export type TrendsViewProps = {
  state: 'loading' | 'error' | 'ready';
  board?: TrendBoard;
  refreshing: boolean;
  onRefresh: () => void;
  onRow: (row: TrendRow) => void;
  onBack: () => void;
  onRetry: () => void;
};

/** S09 최근 트렌드 여행지(WD-FR-11, Q-9). 기준 기간·집계 대상·갱신 시점을 위에 밝히고 순위를 보인다 */
export function TrendsView(props: TrendsViewProps) {
  const { board } = props;
  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <Header title="요즘 뜨는 여행지" />
      {props.state === 'error' ? (
        <ErrorState title="순위를 불러오지 못했어요" onRetry={props.onRetry} />
      ) : props.state === 'loading' || !board ? (
        <ActivityIndicator style={styles.flex} color={colors.brand.primary} />
      ) : (
        <FlatList
          data={board.insufficient ? [] : board.rows}
          keyExtractor={(r) => r.regionId}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={props.refreshing}
              onRefresh={props.onRefresh}
              tintColor={colors.brand.primary}
              colors={[colors.brand.primary]}
            />
          }
          ListHeaderComponent={<Basis board={board} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Icon name="trending" size={26} color={colors.text.strong} />
              </View>
              <Text style={styles.emptyTitle}>아직 순위가 없어요</Text>
              <Text style={styles.emptyDesc}>여행이 모이면 보여요</Text>
              <Button
                label="돌아가기"
                variant="neutral"
                onPress={props.onBack}
                style={styles.emptyButton}
              />
            </View>
          }
          renderItem={({ item }) => <Row row={item} onPress={() => props.onRow(item)} />}
        />
      )}
    </SafeAreaView>
  );
}

function Basis({ board }: { board: TrendBoard }) {
  const lines: [IconName, string][] = [
    ...(board.periodLine ? ([['calendar', board.periodLine]] as [IconName, string][]) : []),
    ['trip', '게시된 여행 수 기준'],
    ['refresh', `매일 오전 6시 갱신${board.updatedLine ? ` · ${board.updatedLine}` : ''}`],
  ];
  return (
    <View style={styles.basis}>
      {lines.map(([icon, text]) => (
        <View key={text} style={styles.basisRow}>
          <Icon name={icon} size={14} color={colors.text.icon} />
          <Text style={styles.basisText}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

function Row({ row, onPress }: { row: TrendRow; onPress: () => void }) {
  const src = assetSource(row.coverUrl);
  const top = row.rank <= 3;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${row.rank}위 ${row.name}, 게시된 여행 ${row.tripCount}개${row.friendCount ? `, 친구 ${row.friendCount}명` : ''}`}
    >
      <Text style={[styles.rank, top && styles.rankTop]}>{row.rank}</Text>
      <View style={styles.thumb}>
        <Icon name="image" size={20} color={colors.brand.primary} />
        {src ? <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>
          {row.name}
          {row.sido ? <Text style={styles.sido}> {row.sido}</Text> : null}
        </Text>
        <View style={styles.counts}>
          <Icon name="trip" size={14} color={colors.text.icon} />
          <Text style={styles.count}>{row.tripCount}</Text>
          {row.friendCount > 0 ? (
            <>
              <Icon name="people" size={14} color={colors.text.icon} />
              <Text style={styles.count}>친구 {row.friendCount}</Text>
            </>
          ) : null}
        </View>
      </View>
      <Move move={row.move} />
    </Pressable>
  );
}

function Move({ move }: { move: TrendRow['move'] }) {
  if (move.kind === 'new') {
    return (
      <View style={styles.newBadge}>
        <Text style={styles.newText}>새로</Text>
      </View>
    );
  }
  if (move.kind === 'same') return <Text style={styles.same}>–</Text>;
  const up = move.kind === 'up';
  return (
    <Text
      style={up ? styles.up : styles.down}
      accessibilityLabel={`${move.by}계단 ${up ? '오름' : '내림'}`}
    >
      {up ? '↑' : '↓'} {move.by}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  content: { paddingHorizontal: layout.screenPaddingX, paddingBottom: spacing[32], flexGrow: 1 },
  basis: { gap: spacing[8], paddingTop: spacing[8], paddingBottom: spacing[16] },
  basisRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  basisText: { ...typography.caption, color: colors.text.sub },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    paddingVertical: spacing[12],
  },
  rank: { ...typography.title3, width: 20, textAlign: 'center', color: colors.text.sub },
  rankTop: { color: colors.brand.primaryDark },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.brand.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, minWidth: 0, gap: spacing[4] },
  name: { ...typography.bodyBold, color: colors.text.default },
  sido: { ...typography.caption, color: colors.text.sub },
  counts: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  count: { ...typography.caption, color: colors.text.sub, marginRight: spacing[8] },
  up: { ...typography.captionBold, color: colors.status.success },
  down: { ...typography.captionMedium, color: colors.text.muted },
  same: { ...typography.caption, color: colors.text.muted },
  newBadge: {
    paddingHorizontal: spacing[8],
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.brand.primaryBg,
  },
  newText: { ...typography.captionBold, color: colors.brand.primaryDark },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[8],
    paddingVertical: 80,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    marginBottom: spacing[8],
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { ...typography.title2, color: colors.text.default },
  emptyDesc: { ...typography.body, color: colors.text.sub },
  emptyButton: { marginTop: spacing[16] },
});
