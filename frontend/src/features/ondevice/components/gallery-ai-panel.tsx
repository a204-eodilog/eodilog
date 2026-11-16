// 폰 AI로 정리한 내 폰 사진. 사진은 서버로 보내지 않고 폰에서 나누고 찾는다.
// pick: S30 사진 올리기(골라 담기) / browse: 내 사진 찾기(눌러서 크게 보기)
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Icon, ProgressBar } from '@/components/ui';
import { ImageViewer } from '@/components/ui/image-viewer';
import { PressableScale } from '@/components/ui/pressable-scale';
import { TextField } from '@/components/ui/text-field';
import { colors, radius, spacing, typography } from '@/theme';

import { PhotoTile } from '../../photo/components/photo-tile';
import { TOPICS as PHOTO_TOPICS } from '../../photo/photo-list-rules';
import type { GalleryAi, GalleryTopicFilter } from '../use-gallery-ai';

const CHIPS: { key: GalleryTopicFilter; label: string }[] = [
  { key: 'ALL', label: '전체' },
  ...PHOTO_TOPICS,
];

export type GalleryAiPanelProps = {
  ai: GalleryAi;
  /** 사진 한 칸 크기와 칸 사이 */
  tile: number;
  gap: number;
  /** 첫 카드 제목 */
  title: string;
  mode: 'pick' | 'browse';
  /** pick: [n장 담기] */
  onAdd?: () => void;
  /** browse: 기간(여행)마다 칩 이름. ranges와 같은 순서 */
  rangeLabels?: readonly string[];
};

export function GalleryAiPanel(props: GalleryAiPanelProps) {
  const { ai } = props;
  const [viewing, setViewing] = useState<number | null>(null);
  if (!ai.available) return null;

  if (ai.phase !== 'ready') return <StatusCard {...props} />;

  const count = ai.selected.size;
  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={[typography.title3, styles.text]}>{props.title}</Text>
        <Text style={[typography.caption, styles.sub]}>{ai.counts.ALL}장 · 폰에서 정리함</Text>
      </View>
      {ai.limited ? (
        <Text style={[typography.caption, styles.sub]}>
          사진 접근을 일부만 허용해서 허용한 사진만 보여요. 설정에서 모든 사진을 허용하면 더 많이
          정리할 수 있어요
        </Text>
      ) : null}
      <TextField
        variant="filled"
        value={ai.query}
        onChangeText={ai.setQuery}
        placeholder="바다, 해운대에서 먹은 회처럼 찾아보세요"
        accessibilityLabel="폰 사진 찾기"
        returnKeyType="search"
        trailing={
          ai.query ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="검색어 지우기"
              hitSlop={12}
              onPress={() => ai.setQuery('')}
            >
              <Icon name="close" size={18} color={colors.text.icon} />
            </PressableScale>
          ) : (
            <Icon name="search" size={18} color={colors.text.icon} />
          )
        }
      />
      {ai.queryMs !== null ? (
        <Text style={[typography.caption, styles.sub]}>
          폰에서 찾았어요 · {(ai.queryMs / 1000).toFixed(2)}초
        </Text>
      ) : null}
      {props.rangeLabels && props.rangeLabels.length > 1 ? (
        <View style={styles.chips}>
          <Chip
            label="모든 여행"
            on={ai.rangeFilter === null}
            onPress={() => ai.setRangeFilter(null)}
          />
          {props.rangeLabels.map((label, i) => (
            <Chip
              key={`${label}-${i}`}
              label={label}
              on={ai.rangeFilter === i}
              onPress={() => ai.setRangeFilter(i)}
            />
          ))}
        </View>
      ) : null}
      <View style={styles.chips}>
        {CHIPS.map((chip) => (
          <Chip
            key={chip.key}
            label={`${chip.label} ${ai.counts[chip.key]}`}
            on={chip.key === ai.topic}
            onPress={() => ai.setTopic(chip.key)}
          />
        ))}
      </View>
      {ai.tiles.length === 0 ? (
        <Text style={[typography.body, styles.sub, styles.empty]}>사진이 없어요</Text>
      ) : (
        <View style={[styles.grid, { gap: props.gap }]}>
          {ai.tiles.map((t, i) => (
            <View key={t.photo.id}>
              <PhotoTile
                uri={t.photo.uri}
                size={props.tile}
                selected={props.mode === 'pick' ? ai.selected.has(t.photo.id) : undefined}
                label={`폰 사진 ${i + 1}${t.groupSize > 1 ? `, 비슷한 사진 ${t.groupSize}장` : ''}`}
                onPress={() => (props.mode === 'pick' ? ai.toggle(t.photo.id) : setViewing(i))}
              />
              {t.groupKey ? (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={
                    t.expanded ? '비슷한 사진 접기' : `비슷한 사진 ${t.groupSize}장 펼치기`
                  }
                  hitSlop={8}
                  onPress={() => ai.toggleGroup(t.groupKey!)}
                  style={styles.badge}
                >
                  <Text style={[typography.captionMedium, styles.badgeText]}>
                    {t.expanded ? '접기' : `+${t.groupSize - 1}`}
                  </Text>
                </PressableScale>
              ) : null}
            </View>
          ))}
        </View>
      )}
      {props.mode === 'pick' ? (
        <Button
          label={count > 0 ? `${count}장 담기` : '담을 사진을 골라 주세요'}
          icon="plus"
          disabled={count === 0}
          onPress={props.onAdd}
        />
      ) : null}
      <ImageViewer
        images={ai.tiles.map((t) => ({ id: t.photo.id, url: t.photo.uri }))}
        index={viewing}
        onClose={() => setViewing(null)}
      />
    </View>
  );
}

function StatusCard({ ai, title }: GalleryAiPanelProps) {
  const busy = ai.phase === 'downloading' || ai.phase === 'loading' || ai.phase === 'analyzing';
  const { done, total } = ai.progress;
  const status = {
    idle: '사진은 서버로 보내지 않고, 인터넷 없이도 폰에서 정리해요',
    blocked: '설정에서 AI 사진 분류가 꺼져 있어요. 설정 > AI에서 켜면 쓸 수 있어요',
    'confirm-download':
      '처음 한 번 폰 AI 모델(약 190MB)을 받아요. 지금 모바일 데이터를 쓰고 있어요. 와이파이에서 받는 걸 권해요',
    downloading: `폰 AI 모델을 받고 있어요 (${done}/${total})`,
    loading: '폰 AI를 준비하고 있어요',
    analyzing: `사진 ${total}장 중 ${done}장을 정리했어요${ai.msPerPhoto !== null ? ` · 장당 ${(ai.msPerPhoto / 1000).toFixed(2)}초` : ''}`,
    denied: '사진 접근을 허용해야 정리할 수 있어요. 설정에서 사진 권한을 켜 주세요',
    'no-dates': '여행 날짜가 정해지면 그 기간에 찍은 사진을 정리할 수 있어요',
    error: '정리하지 못했어요. 다시 시도해 주세요',
    ready: '',
  }[ai.phase];
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}>
          <Icon name="image" size={20} color={colors.brand.primaryDark} />
        </View>
        <View style={styles.flex}>
          <Text style={[typography.bodyBold, styles.text]}>{title}</Text>
          <Text style={[typography.caption, styles.sub]}>{status}</Text>
        </View>
      </View>
      {busy ? (
        <ProgressBar ratio={total ? done / total : 0} height={4} accessibilityLabel={status} />
      ) : ai.phase === 'confirm-download' ? (
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button label="나중에" variant="neutral" onPress={ai.cancelDownload} />
          </View>
          <View style={styles.flex}>
            <Button label="지금 받기" onPress={ai.confirmDownload} />
          </View>
        </View>
      ) : ai.phase === 'idle' || ai.phase === 'error' ? (
        <Button
          label={ai.phase === 'error' ? '다시 정리하기' : '정리하기'}
          icon="image"
          onPress={ai.start}
        />
      ) : null}
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
    >
      <Text style={[typography.captionMedium, on ? styles.chipTextOn : styles.sub]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing[8] },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
  pressed: { opacity: 0.6 },
  wrap: { gap: spacing[12] },
  card: {
    gap: spacing[14],
    padding: spacing[18],
    borderRadius: radius.xl,
    backgroundColor: colors.brand.primaryBg,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.white,
  },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
  chip: {
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
  },
  chipOn: { backgroundColor: colors.brand.primaryLight },
  chipTextOn: { color: colors.brand.primaryDark },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  empty: { textAlign: 'center', paddingVertical: spacing[24] },
  badge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.text.default,
  },
  badgeText: { color: colors.surface.white },
});
