import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

import { PillButton } from './pill-button';

/** S33 방문 후보 없음 안내 상자. [사진 올리기] → S30 */
export function NoCandidateBox({ onUpload }: { onUpload: () => void }) {
  return (
    <View style={styles.box}>
      <View style={styles.top}>
        <View style={styles.circle}>
          <Icon name="image" size={22} color={colors.text.icon} />
        </View>
        <View style={styles.texts}>
          <Text style={[typography.bodyBold, styles.title]}>사진으로 찾은 방문 장소가 없어요</Text>
          <Text style={[typography.caption, styles.sub]}>다녀온 곳을 직접 체크해 주세요</Text>
        </View>
      </View>
      <View style={styles.action}>
        <PillButton label="사진 올리기" icon="upload" tone="white" onPress={onUpload} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.surface.default,
    borderRadius: radius.xl,
    padding: spacing[20],
    gap: spacing[18],
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing[14] },
  circle: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: spacing[2] },
  title: { color: colors.text.default },
  sub: { color: colors.text.icon },
  action: { flexDirection: 'row' },
});
