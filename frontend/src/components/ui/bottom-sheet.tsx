import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
 * 어두운 막을 누르거나 아래로 끌면 닫힌다. 높이는 내용에 맞춰 잡힌다.
 * 앱 시작 레이아웃(src/app/_layout.tsx)의 BottomSheetModalProvider 안에서만 동작한다.
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
  const ref = useRef<BottomSheetModal>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (visible) {
      ref.current?.present();
      opened.current = true;
      return;
    }
    // 한 번도 열지 않은 시트에 dismiss()를 부르면 이후 present()가 아무것도 그리지 않는다
    // (@gorhom/bottom-sheet 5.2.11+ 버그, 이슈 #2787). 열린 적이 있을 때만 닫는다
    if (opened.current) ref.current?.dismiss();
  }, [visible]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={1}
        style={[props.style, styles.backdrop]}
      />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={ref}
      onDismiss={onClose}
      enableDynamicSizing
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheet}
      handleIndicatorStyle={styles.handle}
      handleStyle={styles.handleArea}
    >
      <BottomSheetView
        style={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing[20]) }]}
      >
        {title ? <Text style={[typography.title1, styles.title]}>{title}</Text> : null}
        {description ? (
          <Text style={[typography.body, styles.description]}>{description}</Text>
        ) : null}
        {children ? <View style={styles.body}>{children}</View> : null}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface.white,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
  },
  handleArea: { paddingTop: spacing[8], paddingBottom: spacing[4] },
  handle: { width: 40, height: 4, backgroundColor: colors.gray[200] },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    gap: spacing[8],
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
