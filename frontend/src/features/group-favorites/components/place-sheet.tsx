import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar, BottomSheet, Button, Icon, TextField } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Spinner } from '@/components/ui/spinner';
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
  /**
   * 이 장소를 내 개인 즐겨찾기(나만 보는 저장 탭)에도 담는다. 동행이 올린 장소도 담을 수 있다.
   * 없으면 줄을 그리지 않는다(미리보기)
   */
  onSavePersonal?: () => void;
  /** 이미 내 개인 즐겨찾기에 있다. 줄이 "있어요"로 바뀌고 눌리지 않는다 */
  personalSaved?: boolean;
  savingPersonal?: boolean;
};

/**
 * 그룹 즐겨찾기 장소 시트(가정 Q-7-5). 담은 사람과 메모를 보이고,
 * 내가 담았으면 내 메모 고치기와 [내 저장 빼기], 안 담았으면 [나도 담기].
 * 누가 담았든 [내 즐겨찾기에도 저장]으로 내 개인 저장 탭에 담을 수 있다(2026-11-14 사용자 요청).
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
          {props.onSavePersonal ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={
                props.personalSaved ? '내 즐겨찾기에 있어요' : '내 즐겨찾기에도 저장'
              }
              accessibilityState={{
                disabled: props.personalSaved || props.savingPersonal,
                busy: props.savingPersonal,
              }}
              disabled={props.personalSaved || props.savingPersonal}
              onPress={props.onSavePersonal}
              style={({ pressed }) => [styles.personal, pressed && styles.pressed]}
            >
              <View style={styles.personalIcon}>
                <Icon
                  name="bookmark"
                  size={20}
                  color={colors.brand.primary}
                  filled={props.personalSaved}
                />
              </View>
              <View style={styles.saverTexts}>
                <Text style={[typography.bodyBold, styles.saverName]}>
                  {props.personalSaved ? '내 즐겨찾기에 있어요' : '내 즐겨찾기에도 저장'}
                </Text>
                <Text style={[typography.caption, styles.personalHint]}>
                  {props.personalSaved
                    ? '저장 탭에서 볼 수 있어요'
                    : '저장 탭에 담겨 나만 볼 수 있어요'}
                </Text>
              </View>
              {props.savingPersonal ? (
                <Spinner color={colors.brand.primary} />
              ) : props.personalSaved ? (
                <Icon name="check" size={20} color={colors.brand.primary} />
              ) : (
                <Icon name="plus" size={20} color={colors.text.icon} />
              )}
            </PressableScale>
          ) : null}
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
                icon="check"
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
            <Button
              label="나도 담기"
              icon="plus"
              size="xl"
              block
              loading={props.busy}
              onPress={props.onAdd}
            />
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
  // 내 개인 즐겨찾기에 담는 줄. 여행에 담는 버튼과 헷갈리지 않게 연파랑 칸으로 따로 둔다
  personal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    padding: spacing[12],
    borderRadius: radius.lg,
    backgroundColor: colors.brand.primaryBg,
  },
  personalIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.white,
  },
  personalHint: { color: colors.text.icon },
  pressed: { opacity: 0.8 },
  remove: {
    minHeight: layout.minTouchTarget + spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[6],
  },
});
