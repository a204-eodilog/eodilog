import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { BottomSheet, Button } from '@/components/ui';
import { spacing } from '@/theme';

type Props = { visible: boolean; onClose: () => void };

/** S16 프로필 미완성. 서버가 403 PROFILE_INCOMPLETE로 막았을 때. 입력한 값은 그대로 둔다 */
export function ProfileIncompleteSheet({ visible, onClose }: Props) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="닉네임을 먼저 정해 주세요"
      description="동행에게 보일 이름이 있어야 여행을 만들 수 있어요"
      footer={
        <View style={styles.footer}>
          <Button
            label="닉네임 정하기"
            size="xl"
            block
            onPress={() => {
              onClose();
              router.push('/profile');
            }}
          />
          <Button label="나중에" variant="text" block onPress={onClose} />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  footer: { gap: spacing[4] },
});
