import { View } from 'react-native';

import { Header } from '@/components/ui';
import { colors } from '@/theme';

/** S23 코스 짜기. 초안 고치기·직접 만들기·준비 상태는 다음 작업에서 채운다 */
export function CourseEditScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.white }}>
      <Header title="코스 짜기" />
    </View>
  );
}
