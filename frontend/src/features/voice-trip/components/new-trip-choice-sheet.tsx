import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet, Icon, type IconName } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, radius, spacing, typography } from '@/theme';

type Props = { visible: boolean; onClose: () => void };

/** 실험: [+ 새 여행]을 누르면 말로 만들지, 지금처럼 직접 입력할지 고른다 */
export function NewTripChoiceSheet({ visible, onClose }: Props) {
  const go = (path: '/trips/new-voice' | '/trips/new') => {
    onClose();
    router.push(path);
  };
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="새 여행을 어떻게 만들까요?"
      titleVariant="title2"
    >
      <View style={styles.list}>
        <Choice
          icon="mic"
          title="말로 만들기"
          body="어디로, 언제, 뭐 할지 쭉 말하면 여행과 코스 초안을 만들어 드려요"
          strong
          onPress={() => go('/trips/new-voice')}
        />
        <Choice
          icon="pencil"
          title="직접 입력하기"
          body="이름·날짜·여행지를 적어요. 코스는 나중에 짜요"
          onPress={() => go('/trips/new')}
        />
      </View>
    </BottomSheet>
  );
}

function Choice(props: {
  icon: IconName;
  title: string;
  body: string;
  strong?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={props.title}
      onPress={props.onPress}
      style={[styles.card, props.strong && styles.cardStrong]}
    >
      <View style={[styles.icon, props.strong && styles.iconStrong]}>
        <Icon
          name={props.icon}
          size={24}
          color={props.strong ? colors.text.inverse : colors.text.icon}
        />
      </View>
      <View style={styles.text}>
        <Text style={[typography.bodyBold, styles.title]}>{props.title}</Text>
        <Text style={[typography.caption, styles.body]}>{props.body}</Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing[12], paddingTop: spacing[4] },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    padding: spacing[16],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line.strong,
    backgroundColor: colors.surface.white,
  },
  cardStrong: {
    borderWidth: 2,
    borderColor: colors.brand.primary,
    backgroundColor: colors.brand.primaryBg,
    padding: spacing[16] - 1,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.default,
  },
  iconStrong: { backgroundColor: colors.brand.primary },
  text: { flex: 1, gap: spacing[2] },
  title: { color: colors.text.default },
  body: { color: colors.text.sub },
});
