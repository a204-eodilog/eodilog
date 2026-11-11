import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet, Button, Icon, TextField } from '@/components/ui';
import { colors, layout, spacing, typography } from '@/theme';

import { LABEL_MAX, validateLabel } from '../checklist-rules';
import type { ChecklistItem } from '../types';

type Props = {
  /** 고칠 항목. null이면 닫혀 있다 */
  item: ChecklistItem | null;
  onClose(): void;
  /** 끝났으면 true. 시트를 닫는다 */
  onSave(item: ChecklistItem, label: string): Promise<boolean>;
  onDelete(item: ChecklistItem): void;
};

/**
 * 준비물 고치기 시트. 디자인 결정의 '항목 고치기 시트: S27 준비물 고치기'로 디자인이 없어
 * 제목, 이름 입력, [저장], 빨간 [지우기]로 정했다(가정 Q-5-4). 지우기는 확인 없이 바로 지운다.
 */
export function EditItemSheet({ item, onClose, onSave, onDelete }: Props) {
  const [text, setText] = useState(item?.label ?? '');
  const [prevId, setPrevId] = useState(item?.id ?? null);
  /**
   * 시트를 연 때의 항목. 열어 둔 사이 목록을 다시 받아 version이 올라가도 연 때의 version으로 보내야
   * 다른 동행이 그 사이 바꾼 이름을 말없이 덮지 않고 충돌로 알 수 있다
   */
  const [opened, setOpened] = useState(item);
  const [saving, setSaving] = useState(false);
  // 다른 항목으로 열리면 입력을 그 항목 이름으로 다시 채운다
  if ((item?.id ?? null) !== prevId) {
    setPrevId(item?.id ?? null);
    setText(item?.label ?? '');
    setOpened(item);
  }

  const valid = validateLabel(text) !== null;

  const save = async () => {
    if (!item || !valid || saving) return;
    setSaving(true);
    const done = await onSave(opened ?? item, text);
    setSaving(false);
    if (done) onClose();
  };

  return (
    <BottomSheet
      visible={item !== null}
      onClose={onClose}
      title="준비물 고치기"
      titleVariant="title3"
    >
      {/* 시트 footer는 오른쪽 끝 한 줄이라, 꽉 찬 저장과 지우기는 본문에 둔다 */}
      <View style={styles.body}>
        <TextField
          variant="filled"
          value={text}
          onChangeText={setText}
          accessibilityLabel="준비물 이름"
          maxLength={LABEL_MAX}
          hideCount
          returnKeyType="done"
          onSubmitEditing={() => void save()}
        />
        <View style={styles.actions}>
          <Button
            label="저장"
            size="xl"
            block
            onPress={() => void save()}
            disabled={!valid}
            loading={saving}
          />
          {/* 공통 Button의 글자 버튼은 파랑뿐이라 지우기는 빨간 글자로 따로 그린다 */}
          <Pressable
            style={styles.delete}
            accessibilityRole="button"
            onPress={() => {
              if (!item) return;
              onDelete(item);
              onClose();
            }}
          >
            <Icon name="trash" size={18} color={colors.status.danger} />
            <Text style={[typography.bodyBold, styles.deleteText]}>지우기</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing[20] },
  actions: { gap: spacing[4] },
  delete: {
    minHeight: layout.minTouchTarget + spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[6],
  },
  deleteText: { color: colors.status.danger },
});
