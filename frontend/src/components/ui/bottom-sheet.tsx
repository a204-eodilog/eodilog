import { Easing } from 'react-native-reanimated';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  useBottomSheetTimingConfigs,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing, typography, motion } from '@/theme';

import { Stagger } from './stagger';

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
  /** 서버 처리 중처럼 닫히면 안 될 때. 어두운 막을 눌러도, 아래로 끌어도 닫히지 않는다 */
  locked?: boolean;
  /**
   * 제목 글자. 기본 title1(23, S50 확인 시트). 피그마가 더 작게 그린 시트는 바꾼다:
   * title2(20) S19 방장 넘기기 대상 선택, title3(18) S16 여행 기간
   */
  titleVariant?: 'title1' | 'title2' | 'title3';
  /** 설명 글자. 기본 body(16, S50 짧은 확인 시트). 피그마가 캡션으로 그린 시트는 caption(12) */
  descriptionVariant?: 'body' | 'caption';
};

/**
 * 아래에서 올라오는 시트. 장소 추가, 투표 열기, 나가기 확인에 쓴다.
 * 어두운 막을 누르거나 아래로 끌면 닫힌다(locked면 안 닫힌다). 높이는 내용에 맞춰 잡힌다.
 * 앱 시작 레이아웃(src/app/_layout.tsx)의 BottomSheetModalProvider 안에서만 동작한다.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  description,
  children,
  footer,
  locked = false,
  titleVariant = 'title1',
  descriptionVariant = 'body',
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const ref = useRef<BottomSheetModal>(null);
  // 시트가 지금 떠 있는지. 이미 닫힌 시트에 dismiss()를 또 부르면 다음 present()가 아무것도 그리지 않는다
  // (@gorhom/bottom-sheet 5.2.11+ 버그, 이슈 #2787). 사용자가 뒤로 버튼·어두운 막·끌어내리기로 닫으면
  // onDismiss에서 false가 되므로, 부모가 visible을 false로 바꿔도 한 번 더 닫지 않는다
  const presented = useRef(false);

  useEffect(() => {
    if (visible) {
      if (presented.current) return;
      presented.current = true;
      ref.current?.present();
      return;
    }
    if (!presented.current) return;
    presented.current = false;
    ref.current?.dismiss();
  }, [visible]);

  const handleDismiss = useCallback(() => {
    presented.current = false;
    onClose();
  }, [onClose]);

  // 안드로이드 뒤로 버튼은 화면이 아니라 열린 시트를 먼저 닫는다. 처리 중(locked)이면 닫지도 나가지도 않는다.
  // 시트가 열린 동안만 듣고, 나중에 등록한 것이 먼저 불리므로 화면의 뒤로 처리보다 앞선다
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // 어두운 막을 눌렀을 때와 같이 시트를 내리면 onDismiss가 onClose를 한 번 부른다
      if (!locked) ref.current?.dismiss();
      return true;
    });
    return () => sub.remove();
  }, [visible, locked]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={1}
        pressBehavior={locked ? 'none' : 'close'}
        style={[props.style, styles.backdrop]}
      />
    ),
    [locked],
  );

  const animationConfigs = useBottomSheetTimingConfigs({
    duration: motion.sheet.duration,
    easing: Easing.out(Easing.cubic),
  });

  return (
    <BottomSheetModal
      ref={ref}
      onDismiss={handleDismiss}
      enableDynamicSizing
      enablePanDownToClose={!locked}
      // 창이 올라오고 내려가는 빠르기. 기본값은 너무 빨라 툭 튀어나와 보였다
      animationConfigs={animationConfigs}
      // 입력 칸을 누르면 창이 글자판 위로 올라가고, 글자판이 내려가면 제자리로 돌아온다
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheet}
      handleIndicatorStyle={styles.handle}
      handleStyle={styles.handleArea}
    >
      <BottomSheetView
        style={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom + spacing[20], spacing[24]) },
        ]}
      >
        {/* 시트가 올라오는 동안 제목 → 설명 → 내용 → 버튼 줄이 한 줄씩 나타난다. 열릴 때마다 다시 한다 */}
        <Stagger active={visible}>
          {title ? <Text style={[typography[titleVariant], styles.title]}>{title}</Text> : null}
          {description ? (
            <Text style={[typography[descriptionVariant], styles.description]}>{description}</Text>
          ) : null}
          {children ? (
            // 제목이 없는 시트(기간 시트처럼 내용 안에 제목 줄이 있는 시트)는 손잡이 아래 16에서 바로 시작한다
            <View style={title || description ? styles.body : undefined}>{children}</View>
          ) : null}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Stagger>
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
  // 손잡이 36x4는 위 12. 시트 안 여백은 피그마(좌우 20)보다 조금 넓게 둔다(2026-11-05 사용자 요청: 여백이 좁아 보임)
  handleArea: { paddingTop: spacing[12], paddingBottom: 0 },
  handle: { width: 36, height: 4, backgroundColor: colors.gray[300] },
  content: {
    paddingHorizontal: spacing[24],
    paddingTop: spacing[20],
    gap: spacing[10],
  },
  title: { color: colors.text.default },
  description: { color: colors.text.sub },
  body: { paddingTop: spacing[12] },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing[8],
    paddingTop: spacing[24],
  },
});
