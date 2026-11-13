import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, TextField } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, radius, spacing } from '@/theme';

import { LABEL_MAX, validateLabel } from '../checklist-rules';

type Props = {
  /** 더했으면 true. true일 때만 입력을 비운다 */
  onAdd(label: string): Promise<boolean>;
  busy: boolean;
  /** 빈 상태에서 [직접 추가]로 나타났을 때 바로 쓸 수 있게 초점을 준다 */
  autoFocus?: boolean;
};

/** 목록 아래 '챙길 것 추가' 입력과 추가 버튼(Figma 201-15456). 키보드 완료로도 더한다 */
export function AddItemBar({ onAdd, busy, autoFocus = false }: Props) {
  const [text, setText] = useState('');
  const ready = validateLabel(text) !== null && !busy;

  const submit = async () => {
    if (!ready) return;
    if (await onAdd(text)) setText('');
  };

  return (
    <View style={styles.row}>
      <View style={styles.field}>
        <TextField
          variant="filled"
          value={text}
          onChangeText={setText}
          placeholder="챙길 것 추가"
          accessibilityLabel="챙길 것 추가"
          maxLength={LABEL_MAX}
          hideCount
          returnKeyType="done"
          submitBehavior="submit"
          onSubmitEditing={() => void submit()}
          autoFocus={autoFocus}
        />
      </View>
      <PressableScale
        style={[styles.add, !ready && styles.addOff]}
        onPress={() => void submit()}
        disabled={!ready}
        accessibilityRole="button"
        accessibilityLabel="추가"
        accessibilityState={{ disabled: !ready }}
      >
        <Icon name="plus" size={20} color={colors.text.default} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[10] },
  field: { flex: 1 },
  add: {
    width: 48,
    height: 48,
    borderRadius: radius.xxl,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addOff: { opacity: 0.5 },
});
