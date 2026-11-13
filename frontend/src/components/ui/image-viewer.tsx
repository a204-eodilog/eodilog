import { Image } from 'expo-image';
import { FlatList, Modal, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { assetSource } from '@/lib/asset-image';
import { colors, radius, spacing, typography } from '@/theme';

import { Icon } from './icon';
import { PressableScale } from './pressable-scale';

type ImageViewerProps = {
  /** 사진 주소들. 서버 경로(/assets/…)나 전체 주소 */
  images: readonly { id: string; url: string }[];
  /** 처음 보일 사진의 순서. null이면 닫힌 상태 */
  index: number | null;
  onClose: () => void;
};

/**
 * 사진 크게 보기. 검은 바탕에 사진 하나가 화면에 꽉 차게 보이고, 옆으로 밀어 다음 사진으로 넘긴다.
 * 위 오른쪽 [닫기], 아래에 "2 / 5". 기기 뒤로도 닫힌다
 */
export function ImageViewer({ images, index, onClose }: ImageViewerProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const open = index !== null && images.length > 0;
  return (
    <Modal visible={open} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.screen}>
        {open ? (
          <FlatList
            data={images}
            keyExtractor={(p) => p.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={Math.min(index, images.length - 1)}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            renderItem={({ item, index: order }) => {
              const source = assetSource(item.url);
              return (
                <View
                  style={{ width, height }}
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={`사진 ${order + 1} / ${images.length}`}
                >
                  {source ? (
                    <Image source={source} style={styles.image} contentFit="contain" />
                  ) : (
                    <View style={styles.placeholder}>
                      <Icon name="image" size={40} color={colors.text.muted} />
                    </View>
                  )}
                  {images.length > 1 ? (
                    <Text style={[styles.count, { bottom: insets.bottom + spacing[24] }]}>
                      {order + 1} / {images.length}
                    </Text>
                  ) : null}
                </View>
              );
            }}
          />
        ) : null}
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="닫기"
          hitSlop={8}
          onPress={onClose}
          style={[styles.close, { top: insets.top + spacing[8] }]}
        >
          <Icon name="close" size={24} color={colors.text.inverse} />
        </PressableScale>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.text.default },
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
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  count: {
    ...typography.caption,
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: colors.text.inverse,
  },
});
