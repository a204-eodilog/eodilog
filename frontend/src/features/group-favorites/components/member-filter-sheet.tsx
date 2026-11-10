import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, BottomSheet, Icon } from '@/components/ui';
import { colors, spacing, typography } from '@/theme';

type Props = {
  visible: boolean;
  onClose(): void;
  members: { id: string; name: string; imageUrl?: string | null; me?: boolean }[];
  value: string | null;
  onChange(memberId: string | null): void;
};

/** 동행 고르기 시트. 고른 동행이 담은 장소만 본다(가정 Q-7-5) */
export function MemberFilterSheet({ visible, onClose, members, value, onChange }: Props) {
  const pick = (id: string | null) => {
    onChange(id);
    onClose();
  };
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="누가 담은 곳을 볼까요?"
      titleVariant="title3"
    >
      <View style={styles.list}>
        <Option label="모두" selected={value === null} onPress={() => pick(null)} />
        {members.map((m) => (
          <Option
            key={m.id}
            label={m.me ? `${m.name} · 나` : m.name}
            selected={value === m.id}
            onPress={() => pick(m.id)}
            avatar={<Avatar name={m.name} imageUrl={m.imageUrl} size="md" me={m.me} />}
          />
        ))}
      </View>
    </BottomSheet>
  );
}

function Option(props: { label: string; selected: boolean; onPress(): void; avatar?: ReactNode }) {
  return (
    <Pressable
      style={styles.option}
      onPress={props.onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: props.selected }}
    >
      {props.avatar ?? (
        <View style={styles.all}>
          <Icon name="people" size={16} color={colors.text.icon} />
        </View>
      )}
      <Text style={[typography.bodyMedium, styles.label]}>{props.label}</Text>
      {props.selected ? <Icon name="check" size={20} color={colors.brand.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing[2] },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing[12], minHeight: 52 },
  all: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, color: colors.text.default },
});
