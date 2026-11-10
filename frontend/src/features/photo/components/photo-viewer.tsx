import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { assetSource } from '@/lib/asset-image';
import { colors, radius, spacing, typography } from '@/theme';

import { photoPath } from '../photo-list-rules';
import type { TripPhoto } from '../types';

/** S31 사진 크게 보기. 검은 바탕에 사진 하나, 위 [닫기], 아래 올린 사람·장소. 기기 뒤로도 닫힌다 */
export function PhotoViewer({
  photo,
  caption,
  onClose,
}: {
  photo: TripPhoto | null;
  /** "지우님이 올림 · 해운대 해변" */
  caption: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const source = photo ? assetSource(photoPath(photo.assetId)) : null;
  return (
    <Modal visible={!!photo} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.screen}>
        {source ? (
          <Image source={source} style={styles.image} contentFit="contain" />
        ) : (
          <View style={styles.placeholder}>
            <Icon name="image" size={40} color={colors.text.muted} />
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="닫기"
          hitSlop={8}
          onPress={onClose}
          style={[styles.close, { top: insets.top + spacing[8] }]}
        >
          <Icon name="close" size={24} color={colors.text.inverse} />
        </Pressable>
        <Text style={[typography.caption, styles.caption, { bottom: insets.bottom + spacing[24] }]}>
          {caption}
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.text.default, justifyContent: 'center' },
  image: { flex: 1 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  close: {
    position: 'absolute',
    right: spacing[16],
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    position: 'absolute',
    left: spacing[20],
    right: spacing[20],
    color: colors.text.inverse,
  },
});
