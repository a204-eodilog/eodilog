import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

import type { UploadStatus } from '../types';

/**
 * 사진 칸(S30, 값 문서 "공통 부품과 맞지 않는 점": S31·S32에서도 같이 쓸 수 있게 B 폴더에 둔다).
 * - 고르기: 고른 사진은 어두운 막 + 흰 동그라미 24 안 체크, 안 고른 사진은 흰 테두리 동그라미만. 누르면 고르기·해제
 * - 올리기: 올린 사진은 초록 동그라미 20 + 체크, 올리는 중은 돌아가는 표시, 실패는 빨간 동그라미 + X와 칸 아래 "실패"
 */
export function PhotoTile({
  uri,
  size,
  selected,
  status,
  onPress,
  label,
}: {
  uri: string;
  size: number;
  /** 고르기 칸이면 고른 여부. 올리기 칸이면 undefined */
  selected?: boolean;
  status?: UploadStatus;
  onPress?: () => void;
  /** 읽어 주기 이름("사진 3") */
  label: string;
}) {
  const picking = selected !== undefined;
  const failed = status === 'failed';
  const stateLabel = picking
    ? selected
      ? '고름'
      : '안 고름'
    : status === 'done'
      ? '올림'
      : failed
        ? '실패'
        : status === 'uploading'
          ? '올리는 중'
          : '기다리는 중';

  return (
    <View style={{ width: size }}>
      <Pressable
        accessibilityRole={picking ? 'checkbox' : 'image'}
        accessibilityState={picking ? { checked: selected } : undefined}
        accessibilityLabel={`${label}, ${stateLabel}`}
        disabled={!onPress}
        onPress={onPress}
        style={({ pressed }) => [
          styles.tile,
          { width: size, height: size },
          pressed && styles.pressed,
        ]}
      >
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        {picking && selected ? <View style={styles.dim} /> : null}
        {picking ? (
          <View style={[styles.pickMark, selected && styles.pickMarkOn]}>
            {selected ? <Icon name="check" size={14} color={colors.text.default} /> : null}
          </View>
        ) : status === 'done' ? (
          <View style={[styles.statusMark, styles.doneMark]}>
            <Icon name="check" size={12} color={colors.text.inverse} />
          </View>
        ) : failed ? (
          <View style={[styles.statusMark, styles.failMark]}>
            <Icon name="close" size={12} color={colors.text.inverse} />
          </View>
        ) : status === 'uploading' ? (
          <>
            <View style={styles.dim} />
            <View style={styles.busy}>
              <ActivityIndicator color={colors.text.inverse} />
            </View>
          </>
        ) : null}
      </Pressable>
      {failed ? <Text style={[typography.micro, styles.failText]}>실패</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.line.default,
  },
  pressed: { opacity: 0.85 },
  dim: { ...StyleSheet.absoluteFill, backgroundColor: colors.text.default, opacity: 0.38 },
  pickMark: {
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
  pickMarkOn: { backgroundColor: colors.surface.white },
  statusMark: {
    position: 'absolute',
    top: spacing[6],
    right: spacing[6],
    width: 20,
    height: 20,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneMark: { backgroundColor: colors.status.success },
  failMark: { backgroundColor: colors.status.dangerMid },
  busy: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  failText: { color: colors.status.danger, marginTop: spacing[4], textAlign: 'center' },
});
