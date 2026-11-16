import { SCROLL_DECELERATION } from '@/theme/scroll';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Stagger } from '@/components/ui/stagger';
import { Button, CenterNotice, Header, Icon, type IconName } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { ProgressBar } from '@/components/ui/progress-bar';
import { colors, layout, radius, spacing, typography } from '@/theme';

import type { UploadPhase } from '../hooks/use-photo-upload';
import { MAX_PHOTOS, uploadCounts } from '../photo-rules';
import type { PickedPhoto, UploadItem } from '../types';
import { PhotoTile } from './photo-tile';

const COLUMNS = 4;
const GAP = spacing[8];

export type PhotoUploadViewProps = {
  /** 머리 아래 여행 이름. 모르면 null */
  tripTitle: string | null;
  phase: UploadPhase;
  /** 고르기 단계: 선택창에서 고른 사진(고른 순) */
  picked: readonly PickedPhoto[];
  /** 고르기 단계: 올릴 사진 key */
  selected: ReadonlySet<string>;
  /** 올리기 단계: 사진별 상태 */
  items: readonly UploadItem[];
  onBack: () => void;
  /** 기기 사진 선택창 열기 */
  onPick: () => void;
  onToggle: (key: string) => void;
  onUpload: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onLater: () => void;
  /**
   * 폰 AI '이 여행 사진 정리하기' 자리(고르기 단계). 사진 칸 크기·간격을 받아 그린다.
   * 없거나 null을 돌려주면 지금처럼 선택창만 보인다
   */
  renderGalleryAi?: (tile: number, gap: number) => ReactNode;
};

/**
 * S30 사진 선택·업로드(WD-FR-19). 사진은 기기 사진 선택창으로 고르고(FE 결정 2026-11-09: 새 네이티브
 * 라이브러리·사진 읽기 권한 없이), 고른 사진을 4열 격자로 보여 준 뒤 올린다.
 * Figma의 날짜 묶음·"여행 기간 사진" 칩·권한 거절 화면은 선택창 방식이라 없다
 */
export function PhotoUploadView(props: PhotoUploadViewProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tile = Math.floor(
    (Math.min(width, 480) - layout.screenPaddingX * 2 - GAP * (COLUMNS - 1)) / COLUMNS,
  );
  const header = (
    <Header
      title="사진 올리기"
      subtitle={props.tripTitle ?? undefined}
      subtitleIcon={props.tripTitle ? 'trip' : undefined}
      onBack={props.onBack}
    />
  );
  const bottomPad = { paddingBottom: Math.max(insets.bottom + spacing[12], 34) };

  const galleryAi = props.phase === 'pick' ? (props.renderGalleryAi?.(tile, GAP) ?? null) : null;

  if (props.phase === 'pick' && props.picked.length === 0 && galleryAi) {
    return (
      <View style={styles.screen}>
        {header}
        <ScrollView
          decelerationRate={SCROLL_DECELERATION}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {galleryAi}
          <Button
            label="갤러리에서 직접 고르기"
            icon="image"
            variant="secondary"
            onPress={props.onPick}
          />
          <Text style={[typography.caption, styles.sub, styles.center]}>
            한 번에 {MAX_PHOTOS}장까지 올릴 수 있어요
          </Text>
        </ScrollView>
      </View>
    );
  }

  if (props.phase === 'pick' && props.picked.length === 0) {
    return (
      <View style={styles.screen}>
        {header}
        <CenterNotice
          icon="image"
          tone="brand"
          title="올릴 사진을 골라 주세요"
          description={`한 번에 ${MAX_PHOTOS}장까지 올릴 수 있어요`}
          actionLabel="사진 고르기"
          actionIcon="image"
          onAction={props.onPick}
        />
      </View>
    );
  }

  if (props.phase === 'pick') {
    const count = props.selected.size;
    return (
      <View style={styles.screen}>
        {header}
        <ScrollView
          decelerationRate={SCROLL_DECELERATION}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Stagger itemStyle={styles.staggerItem}>
            <View style={styles.titleRow}>
              <Text style={[typography.title3, styles.text]}>고른 사진</Text>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="사진 더 고르기"
                hitSlop={8}
                onPress={props.onPick}
                style={({ pressed }) => [styles.inline, pressed && styles.pressed]}
              >
                <Icon name="plus" size={16} color={colors.brand.primaryDark} />
              </PressableScale>
            </View>
            <Hint icon="info" text="사진을 누르면 올리지 않을 사진으로 빠져요" />
            <View style={styles.grid}>
              {props.picked.map((photo, i) => (
                <PhotoTile
                  key={photo.key}
                  uri={photo.uri}
                  size={tile}
                  selected={props.selected.has(photo.key)}
                  label={`사진 ${i + 1}`}
                  onPress={() => props.onToggle(photo.key)}
                />
              ))}
            </View>
          </Stagger>
          {galleryAi}
        </ScrollView>
        <View style={[styles.bottom, styles.bottomSplit, bottomPad]}>
          <Text style={[typography.bodyBold, styles.text]}>{count}장 선택</Text>
          <Button
            label="올리기"
            icon="upload"
            size="lg"
            disabled={count === 0}
            onPress={props.onUpload}
          />
        </View>
      </View>
    );
  }

  const { total, done, failed } = uploadCounts(props.items);
  const isFailed = props.phase === 'failed';
  return (
    <View style={styles.screen}>
      {header}
      <ScrollView decelerationRate={SCROLL_DECELERATION} contentContainerStyle={styles.body}>
        <Stagger itemStyle={styles.staggerItem}>
          {isFailed ? (
            <View style={[styles.box, styles.failBox]}>
              <View style={styles.boxRow}>
                <View style={styles.boxIcon}>
                  <Icon name="alert" size={22} color={colors.status.danger} />
                </View>
                <View style={styles.boxTexts}>
                  <Text style={[typography.bodyBold, styles.text]}>
                    {failed}장을 올리지 못했어요
                  </Text>
                  <Text style={[typography.caption, styles.sub]}>
                    {done > 0
                      ? `${done}장은 올라갔어요`
                      : '인터넷 연결을 확인하고 다시 시도해 주세요'}
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={[styles.box, styles.progressBox]}>
              <View style={styles.boxRow}>
                <View style={styles.boxIcon}>
                  <Icon name="upload" size={22} color={colors.brand.primary} />
                </View>
                <View style={styles.boxTexts}>
                  <Text style={[typography.bodyBold, styles.text]}>
                    {total}장 중 {done}장 올렸어요
                  </Text>
                  <Text style={[typography.caption, styles.sub]}>
                    다 올리면 주제와 장소별로 나눠요
                  </Text>
                </View>
              </View>
              <ProgressBar ratio={total ? done / total : 0} trackColor={colors.surface.white} />
            </View>
          )}
          <View style={styles.grid}>
            {props.items.map((item, i) => (
              <PhotoTile
                key={item.photo.key}
                uri={item.photo.uri}
                size={tile}
                status={item.status}
                label={`사진 ${i + 1}`}
              />
            ))}
          </View>
          <Hint
            icon="info"
            text={
              isFailed ? `실패한 ${failed}장만 다시 올려요` : '취소해도 이미 올린 사진은 남아요'
            }
          />
        </Stagger>
      </ScrollView>
      {isFailed ? (
        <View style={[styles.bottom, styles.bottomEnd, bottomPad]}>
          <TextButton label="나중에" onPress={props.onLater} />
          <Button
            label={`${failed}장 다시 시도`}
            count={failed}
            icon="refresh"
            size="lg"
            onPress={props.onRetry}
          />
        </View>
      ) : (
        <View style={[styles.bottom, styles.bottomStart, bottomPad]}>
          <TextButton label="올리기 취소" onPress={props.onCancel} />
        </View>
      )}
    </View>
  );
}

/** 회색 글자 버튼(값 문서: `typography.bodyMedium` `colors.text.icon`, 높이 48, 좌우 16) */
function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
    >
      <Text style={[typography.bodyMedium, styles.sub]}>{label}</Text>
    </PressableScale>
  );
}

function Hint({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.inline}>
      <Icon name={icon} size={16} color={colors.text.icon} />
      <Text style={[typography.caption, styles.sub]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // 차례로 나타나는 구역을 감싼 칸. 한 구역이 여러 줄이면 그 사이 간격을 스크롤 내용과 같게 둔다
  staggerItem: { gap: spacing[18] },
  screen: { flex: 1, backgroundColor: colors.surface.white },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
  link: { color: colors.brand.primaryDark },
  pressed: { opacity: 0.6 },
  center: { textAlign: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  body: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    paddingBottom: spacing[24],
    gap: spacing[18],
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  bottom: {
    paddingTop: spacing[12],
    paddingHorizontal: layout.screenPaddingX,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.line.default,
  },
  // 업로드 중 [올리기 취소]는 왼쪽(S30 값 문서)
  bottomStart: { alignItems: 'flex-start' },
  bottomSplit: { flexDirection: 'row', justifyContent: 'space-between' },
  bottomEnd: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[10] },
  textButton: { height: 48, paddingHorizontal: spacing[16], justifyContent: 'center' },
  // 진행·실패 상자: 둥글기 20, 안쪽 18(실패 20), 줄 간격 14
  box: { borderRadius: radius.xl, gap: spacing[14] },
  progressBox: { backgroundColor: colors.brand.primaryBg, padding: spacing[18] },
  failBox: { backgroundColor: colors.surface.subtle, padding: spacing[20] },
  boxRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[14] },
  boxIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxTexts: { flex: 1, gap: spacing[2] },
});
