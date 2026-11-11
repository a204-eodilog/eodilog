import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityRole,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { isReduceMotion } from '@/hooks/use-reduce-motion';
import { colors } from '@/theme';
import { motion } from '@/theme/motion';

import { Stagger } from './stagger';

export type PopupProps = {
  visible: boolean;
  /** 안드로이드 뒤로 가기를 눌렀을 때. 골라야만 닫히는 창이면 아무 일도 하지 않는 함수를 넘긴다 */
  onRequestClose: () => void;
  /** 가운데 카드의 모양(폭, 여백, 둥글기, 그림자). 창마다 Figma 값이 달라 부르는 쪽이 정한다 */
  cardStyle?: StyleProp<ViewStyle>;
  /** 어두운 바탕의 모양. 카드가 화면 끝에 붙지 않게 좌우 여백을 줄 때 쓴다 */
  backdropStyle?: StyleProp<ViewStyle>;
  /** 화면 읽기 프로그램에 알릴 역할. 꼭 봐야 하는 안내면 "alert" */
  accessibilityRole?: AccessibilityRole;
  /** 창이 떠 있는 동안 뒤 화면을 읽지 않게 한다 */
  accessibilityViewIsModal?: boolean;
  /** 카드 밖 어두운 바탕을 눌렀을 때. 없으면 눌러도 아무 일이 없다 */
  onBackdropPress?: () => void;
  /** 바탕 누르기를 화면 읽기 프로그램이 읽을 이름. "알림 닫기" */
  backdropLabel?: string;
  testID?: string;
  children: ReactNode;
};

/**
 * 화면 가운데 뜨는 창. 어두운 바탕은 서서히 나타나고, 카드는 0.92배에서 1배로 커지며 나온다(theme/motion).
 * 로그인 만료, 코스 편집 충돌, 코스에 든 장소 확인, 새 알림 창처럼 화면을 가리고 답을 받는 자리에 쓴다.
 * 아래에서 올라오는 창은 BottomSheet를 쓴다.
 * "동작 줄이기"가 켜져 있으면 커지지 않고 바로 보인다
 */
export function Popup({
  visible,
  onRequestClose,
  cardStyle,
  backdropStyle,
  accessibilityRole,
  accessibilityViewIsModal,
  onBackdropPress,
  backdropLabel,
  testID,
  children,
}: PopupProps) {
  const scale = useState(() => new Animated.Value(1))[0];

  useEffect(() => {
    if (!visible || isReduceMotion()) {
      scale.setValue(1);
      return;
    }
    scale.setValue(motion.popup.fromScale);
    const growing = Animated.timing(scale, {
      toValue: 1,
      duration: motion.popup.duration,
      easing: motion.easing.in,
      useNativeDriver: motion.native,
    });
    growing.start();
    return () => growing.stop();
  }, [visible, scale]);

  return (
    <Modal
      testID={testID}
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
    >
      <View style={[styles.backdrop, backdropStyle]}>
        {onBackdropPress ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onBackdropPress}
            accessibilityLabel={backdropLabel}
          />
        ) : null}
        <Animated.View
          style={[cardStyle, { transform: [{ scale }] }]}
          accessibilityRole={accessibilityRole}
          accessibilityViewIsModal={accessibilityViewIsModal}
        >
          {/* 카드가 커지는 동안 안의 줄(제목, 설명, 버튼)이 한 줄씩 나타난다 */}
          <Stagger active={visible}>{children}</Stagger>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
