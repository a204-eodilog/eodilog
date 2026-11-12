import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';

import { BottomSheet, Button, Tag } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { CheckMarkWhen } from '@/components/ui/check-mark';
import type { Bookmark } from '@/features/saved/types';
import { colors, spacing, typography } from '@/theme';

type Props = {
  visible: boolean;
  onClose(): void;
  /** 내 개인 즐겨찾기. 받는 중이면 undefined */
  bookmarks: Bookmark[] | undefined;
  /** 내가 이미 그룹에 담은 장소 */
  inGroup: Set<string>;
  onConfirm(placeIds: string[]): void;
  busy: boolean;
};

/**
 * 내 개인 즐겨찾기에서 그룹에 담을 장소 고르기. 고른 장소만 동행에게 보인다.
 * 내가 이미 담은 장소는 '담김', 원본이 사라진 장소는 고를 수 없다.
 * 동행만 담은 장소는 골라서 내 저장을 더할 수 있다.
 */
export function BookmarkPickSheet({
  visible,
  onClose,
  bookmarks,
  inGroup,
  onConfirm,
  busy,
}: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [wasVisible, setWasVisible] = useState(visible);
  // 다시 열면 고른 것을 비운다(렌더 중 초기화)
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setPicked(new Set());
  }

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="내 개인 즐겨찾기에서"
      titleVariant="title3"
      description="고른 장소만 동행에게 보여요"
      descriptionVariant="caption"
    >
      {!bookmarks ? (
        <Spinner color={colors.brand.primary} style={styles.loading} />
      ) : bookmarks.length === 0 ? (
        <Text style={[typography.body, styles.empty]}>개인 즐겨찾기가 비어 있어요</Text>
      ) : (
        <ScrollView style={styles.scroll}>
          {bookmarks.map((b) => {
            const id = b.place?.id ?? null;
            const already = id !== null && inGroup.has(id);
            const disabled = id === null || already;
            const on = id !== null && picked.has(id);
            return (
              <PressableScale
                key={id ?? b.retainedPlace.name}
                style={[styles.row, disabled && styles.off]}
                disabled={disabled}
                onPress={() => id && toggle(id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on || already, disabled }}
                accessibilityLabel={b.place?.name ?? b.retainedPlace.name}
              >
                <View style={[styles.box, on || already ? styles.boxOn : styles.boxOff]}>
                  <CheckMarkWhen checked={on || already} size={16} />
                </View>
                <Text style={[typography.bodyMedium, styles.name]} numberOfLines={1}>
                  {b.place?.name ?? b.retainedPlace.name}
                </Text>
                {already ? (
                  <View>
                    <Tag label="담김" small />
                  </View>
                ) : null}
              </PressableScale>
            );
          })}
        </ScrollView>
      )}
      <Button
        label={picked.size > 0 ? `${picked.size}곳 담기` : '장소를 골라 주세요'}
        size="xl"
        block
        disabled={picked.size === 0}
        loading={busy}
        onPress={() => onConfirm([...picked])}
        style={styles.confirm}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  loading: { marginVertical: spacing[24] },
  empty: { color: colors.text.sub, paddingVertical: spacing[24], textAlign: 'center' },
  scroll: { maxHeight: 360 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[12], minHeight: 52 },
  off: { opacity: 0.5 },
  box: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.brand.primary },
  boxOff: { backgroundColor: colors.line.default },
  name: { flex: 1, color: colors.text.default },
  confirm: { marginTop: spacing[16] },
});
