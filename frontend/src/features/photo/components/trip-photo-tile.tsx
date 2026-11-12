import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Avatar, Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { assetSource } from '@/lib/asset-image';
import { colors, radius, spacing } from '@/theme';

import { photoPath } from '../photo-list-rules';

/**
 * 서버에 올라간 사진 한 칸(S31·장소 미지정 묶음). 오른쪽 아래 올린 사람 얼굴 22(나는 연파랑).
 * selected를 주면 고르기 칸(고른 칸은 어두운 막 + 흰 체크)
 */
export function TripPhotoTile({
  assetId,
  width,
  height = width,
  uploader,
  mine,
  selected,
  disabled,
  onPress,
  label,
}: {
  assetId: string;
  width: number;
  height?: number;
  uploader: string;
  mine: boolean;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  label: string;
}) {
  const source = assetSource(photoPath(assetId));
  const picking = selected !== undefined;
  return (
    <PressableScale
      accessibilityRole={picking ? 'checkbox' : 'button'}
      accessibilityState={picking ? { checked: selected, disabled } : { disabled }}
      accessibilityLabel={`${label}, ${uploader}${mine ? '(나)' : ''}님이 올림`}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { width, height }, pressed && styles.pressed]}
    >
      {source ? (
        <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={styles.placeholder}>
          <Icon name="image" size={22} color={colors.text.muted} />
        </View>
      )}
      {picking && selected ? <View style={styles.dim} /> : null}
      {picking && !disabled ? (
        <View style={[styles.mark, selected && styles.markOn]}>
          {selected ? <Icon name="check" size={14} color={colors.text.default} /> : null}
        </View>
      ) : null}
      {disabled ? <View style={styles.disabled} /> : null}
      <View style={styles.face}>
        <Avatar name={uploader} size={22} me={mine} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.line.default },
  pressed: { opacity: 0.85 },
  placeholder: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  dim: { ...StyleSheet.absoluteFill, backgroundColor: colors.text.default, opacity: 0.38 },
  disabled: { ...StyleSheet.absoluteFill, backgroundColor: colors.surface.white, opacity: 0.55 },
  mark: {
    position: 'absolute',
    top: spacing[6],
    right: spacing[6],
    width: 24,
    height: 24,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markOn: { backgroundColor: colors.surface.white },
  face: { position: 'absolute', right: spacing[6], bottom: spacing[6] },
});
