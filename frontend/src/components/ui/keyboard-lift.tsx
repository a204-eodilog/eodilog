import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  KeyboardAvoidingView,
  useReanimatedKeyboardAnimation,
} from 'react-native-keyboard-controller';

type KeyboardLiftProps = {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * 자판이 올라오는 만큼 아래를 비워, 아래쪽 입력 칸과 버튼이 자판 위로 함께 올라오게 한다.
 * 팀이 정한 자판 라이브러리(react-native-keyboard-controller, 기술 스택 문서 "조작감")의 것을 쓴다.
 * react-native의 KeyboardAvoidingView는 안드로이드에서 자판이 다 올라온 뒤에 한 번에 튀어 올랐고,
 * reanimated의 자판 높이를 직접 읽는 방법은 따라오는 움직임이 끊겼다(2026-11-14 사용자 지적).
 * 이 라이브러리는 자판이 움직이는 매 장면을 기기 쪽에서 받아 함께 움직인다.
 * 입력 칸이 아래에 있는 화면은 모두 이것으로 감싼다. 앱 뿌리(_layout)의 KeyboardProvider 안에서만 동작한다
 */
export function KeyboardLift({ style, children }: KeyboardLiftProps) {
  return (
    <KeyboardAvoidingView behavior="padding" style={style}>
      {children}
    </KeyboardAvoidingView>
  );
}

/**
 * 자판이 올라온 높이를 따라 움직이는 값. 자판이 없으면 0, 다 올라오면 자판 높이만큼의 음수다(위로 옮기는 값).
 * 자판을 따라 여백을 줄이는 것처럼 화면이 직접 계산할 때 쓴다
 */
export function useKeyboardShift() {
  return useReanimatedKeyboardAnimation().height;
}
