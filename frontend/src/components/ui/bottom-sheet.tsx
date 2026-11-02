import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout, radius, spacing, typography } from '@/theme';

export type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** 시트 제목. "겨울 여행에서 나갈까요?" */
  title?: string;
  /** 제목 아래 설명 */
  description?: string;
  children?: ReactNode;
  /** 맨 아래 버튼 줄. 보통 [취소] [확인] */
  footer?: ReactNode;
};

/**
 * 아래에서 올라오는 시트. 장소 추가, 투표 열기, 나가기 확인에 쓴다.
 * 어두운 막을 누르면 닫힌다.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  description,
  children,
  footer,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdropWrap}>
        <Pressable accessibilityLabel="닫기" style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing[20]) }]}>
          <View style={styles.handle} />
          {title ? <Text style={[typography.title1, styles.title]}>{title}</Text> : null}
          {description ? (
            <Text style={[typography.body, styles.description]}>{description}</Text>
          ) : null}
          {children ? <View style={styles.body}>{children}</View> : null}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface.white,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[8],
    gap: spacing[8],
    shadowColor: colors.external.black,
    shadowOpacity: 0.2,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: -16 },
    elevation: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.gray[200],
    marginBottom: spacing[12],
  },
  title: { color: colors.text.default },
  description: { color: colors.text.sub },
  body: { paddingTop: spacing[8] },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing[8],
    paddingTop: spacing[16],
  },
});
