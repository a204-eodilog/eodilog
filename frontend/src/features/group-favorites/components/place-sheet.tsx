import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar, BottomSheet, Button, Icon, TextField } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { isMine, MEMO_MAX, myMemo, saverNames } from '../group-rules';
import type { SavedPlace } from '../types';

type Props = {
  item: SavedPlace | null;
  members: readonly { id: string; name: string; me?: boolean }[];
  myMemberId: string | null;
  onClose(): void;
  onSaveMemo(memo: string): void;
  onAdd(): void;
  onRemove(): void;
  busy: boolean;
};

/**
 * 그룹 즐겨찾기 장소 시트(가정 Q-7-5). 담은 사람과 메모를 보이고,
 * 내가 담았으면 내 메모 고치기와 [내 저장 빼기], 안 담았으면 [나도 담기].
 */
export function PlaceSheet({ item, members, myMemberId, onClose, ...props }: Props) {
  const mine = item ? isMine(item, myMemberId) : false;
  const [memo, setMemo] = useState('');
  const [forId, setForId] = useState<string | null>(null);
  // 다른 장소로 열리면 내 메모로 다시 채운다(렌더 중 초기화)
  const currentId = item?.place.id ?? null;
  if (currentId !== forId) {
    setForId(currentId);
    setMemo(item ? myMemo(item, myMemberId) : '');
  }
  const names = item ? saverNames(item, members) : [];
  const changed = item ? memo.trim() !== myMemo(item, myMemberId) : false;

  return (
    <BottomSheet
      visible={item !== null}
      onClose={onClose}
      title={item?.place.name}
      titleVariant="title3"
      description={item?.place.address ?? undefined}
      descriptionVariant="caption"
    >
      {item ? (
        <View style={styles.body}>
          <Text style={[typography.captionBold, styles.label]}>담은 사람 {item.savedCount}명</Text>
          {item.savedBy.map((s, i) => {
            const m = members.find((x) => x.id === s.memberId);
            return (
              <View key={s.memberId} style={styles.saver}>
                <Avatar name={names[i]} size="md" me={m?.me} />
                <View style={styles.saverTexts}>
                  <Text style={[typography.bodyMedium, styles.saverName]}>
                    {m?.me ? `${names[i]} · 나` : names[i]}
                  </Text>
                  {s.memo ? <Text style={[typography.caption, styles.memo]}>{s.memo}</Text> : null}
                </View>
              </View>
            );
          })}
          {mine ? (
            <>
              <TextField
                variant="filled"
                label="내 메모"
                accessibilityLabel="내 메모"
                value={memo}
                onChangeText={setMemo}
                placeholder="동행에게 남길 말"
                maxLength={MEMO_MAX}
                hideCount
                multiline
              />
              <Button
                label="메모 저장"
                size="lg"
                block
                variant="secondary"
                disabled={!changed}
                loading={props.busy}
                onPress={() => props.onSaveMemo(memo)}
              />
              <PressableScale
                style={styles.remove}
                onPress={props.onRemove}
                accessibilityRole="button"
                accessibilityLabel="내 저장 빼기"
              >
                <Icon name="trash" size={22} color={colors.status.danger} />
              </PressableScale>
            </>
          ) : (
            <Button label="나도 담기" size="xl" block loading={props.busy} onPress={props.onAdd} />
          )}
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing[12] },
  label: { color: colors.text.sub },
  saver: { flexDirection: 'row', alignItems: 'center', gap: spacing[10] },
  saverTexts: { flex: 1 },
  saverName: { color: colors.text.default },
  memo: {
    color: colors.text.icon,
    marginTop: spacing[2],
    padding: spacing[8],
    borderRadius: radius.sm,
    backgroundColor: colors.surface.default,
  },
  remove: {
    minHeight: layout.minTouchTarget + spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[6],
  },
});
