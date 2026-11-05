import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { SettingsScreen } from '@/features/settings/screens/settings-screen';
import { colors, spacing, typography } from '@/theme';

/** /dev/settings: 실패 모드에서 설정 변경 → 복원 → 토스트 재시도를 확인한다. */
export function SettingsPreviewScreen() {
  const { screen } = useLocalSearchParams<{ screen?: string }>();
  const initialDetail =
    screen === 'preferences' || screen === 'profile' || screen === 'ai' ? screen : null;
  const [failure, setFailure] = useState(false);
  const [revision, setRevision] = useState(0);
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <SettingsScreen
      key={String(initialDetail) + revision}
      initialDetail={initialDetail}
      preview
      simulateFailure={failure}
      previewControls={
        <View style={styles.controls}>
          <Text style={styles.label}>S45 · {failure ? '설정 바꾸기 실패' : '기본'}</Text>
          <Text style={styles.caption}>
            {failure
              ? '설정을 바꾸면 원래 값으로 돌아와요. 토스트의 다시 시도는 성공해요.'
              : '예시 데이터로 동작해요. 변경값은 서버에 저장하지 않아요.'}
          </Text>
          <View style={styles.buttons}>
            <Button
              label={failure ? '기본 상태로' : '실패 흉내 내기'}
              size="sm"
              onPress={() => {
                setFailure(!failure);
                setRevision(revision + 1);
              }}
            />
            <Button
              label="초기화"
              size="sm"
              variant="neutral"
              onPress={() => setRevision(revision + 1)}
            />
          </View>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  controls: { gap: spacing[8] },
  label: { ...typography.label, color: colors.brand.primary },
  caption: { ...typography.caption, color: colors.text.icon },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
});
