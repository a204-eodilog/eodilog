import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet, Icon, type IconName } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  visible: boolean;
  onClose(): void;
  tripTitle?: string;
  onBookmarks(): void;
  onLink(): void;
  onSearch(): void;
};

/** S20 장소 추가 시트(Figma 201-9751). 개인 즐겨찾기·링크나 캡처·장소 검색 */
export function AddPlaceSheet({
  visible,
  onClose,
  tripTitle,
  onBookmarks,
  onLink,
  onSearch,
}: Props) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="장소 추가"
      titleVariant="title3"
      description={tripTitle ? `${tripTitle} 그룹 즐겨찾기` : undefined}
      descriptionVariant="caption"
    >
      <View style={styles.list}>
        <Option
          icon="lock"
          title="내 개인 즐겨찾기에서"
          body="고른 장소만 동행에게 보여요"
          onPress={onBookmarks}
        />
        <Option
          icon="link"
          title="링크나 캡처로"
          body="붙여 넣으면 장소를 찾아요"
          onPress={onLink}
        />
        <Option icon="search" title="장소 검색" body="이름으로 찾아서 담아요" onPress={onSearch} />
      </View>
    </BottomSheet>
  );
}

function Option(props: { icon: IconName; title: string; body: string; onPress(): void }) {
  return (
    <PressableScale style={styles.option} onPress={props.onPress} accessibilityRole="button">
      <View style={styles.iconBox}>
        <Icon name={props.icon} size={18} color={colors.text.icon} />
      </View>
      <View style={styles.texts}>
        <Text style={[typography.bodyBold, styles.title]}>{props.title}</Text>
        <Text style={[typography.caption, styles.body]}>{props.body}</Text>
      </View>
      <Icon name="chevron-right" size={18} color={colors.text.muted} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing[10] },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    minHeight: 64,
    paddingHorizontal: spacing[16],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: spacing[2] },
  title: { color: colors.text.default },
  body: { color: colors.text.sub },
});
