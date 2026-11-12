import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet, Button, TextField } from '@/components/ui';
import { spacing } from '@/theme';

/** 서버 규칙: 즐겨찾기 메모는 2,000자까지(PersonalBookmarkController PutRequest·PatchRequest) */
export const MEMO_MAX = 2000;

type MemoSheetProps = {
  visible: boolean;
  memo: string;
  saving?: boolean;
  onClose: () => void;
  onSave: (memo: string) => void;
};

/**
 * S14 메모 고치기 시트(값 문서 "인라인 또는 시트" 중 시트).
 * 처음 그릴 때 지금 메모로 채운다. 열 때마다 새 값으로 시작하도록 여는 쪽이 key를 바꿔 준다
 */
export function MemoSheet({ visible, memo, saving = false, onClose, onSave }: MemoSheetProps) {
  const [text, setText] = useState(memo);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      locked={saving}
      title="내 메모"
      footer={
        <View style={styles.footer}>
          <Button label="취소" icon="close" variant="text" disabled={saving} onPress={onClose} />
          <Button
            label="저장"
            icon="check"
            weight="medium"
            loading={saving}
            disabled={text === memo}
            onPress={() => onSave(text.trim())}
          />
        </View>
      }
    >
      <TextField
        variant="filled"
        value={text}
        onChangeText={setText}
        placeholder="이 장소에 남길 메모"
        maxLength={MEMO_MAX}
        multiline
        autoFocus
        accessibilityLabel="내 메모"
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', gap: spacing[8] },
});
