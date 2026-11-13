import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/** 자판이 떠 있는지. 채팅 입력 칸과 지출 추가 아래 줄이 함께 쓴다 */
export function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // iOS는 자판이 오르기 전에(Will), 안드로이드는 올라온 뒤에(Did)만 알려 준다
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}
