import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { useKeyboardVisible } from '@/hooks/use-keyboard-visible';
import { caret, colors, fontFamily, radius, spacing, typography } from '@/theme';

import { MESSAGE_MAX_LENGTH, validateMessageText } from '../chat-rules';

type Props = {
  onSend: (text: string) => void;
  /** 차단·불러오는 중이면 막는다 */
  disabled?: boolean;
  /** /dev/chats 미리보기용 처음 글 */
  initialText?: string;
};

/**
 * S47 입력 칸(피그마 201-25186). 회색 알약 입력 + 파랑 보내기 버튼.
 * 키보드가 올라오면 입력 칸과 버튼만 키보드 바로 위에 붙는다(카카오톡처럼, 2026-11-05 사용자 요청).
 * 공백만이면 버튼을 끄고, 1,000자를 넘으면 안내를 띄운다. 입력한 글은 지우지 않는다(US1 시나리오 8).
 * 피그마 왼쪽 [+](첨부)는 이번 범위가 아니라 두지 않는다
 */
export function Composer({ onSend, disabled = false, initialText = '' }: Props) {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const [text, setText] = useState(initialText);
  const check = validateMessageText(text);
  const canSend = !disabled && check === 'ok';

  const send = () => {
    if (!canSend) return;
    onSend(text);
    setText('');
  };

  // 자판이 떠 있으면 하단 안전 영역(내비게이션 바) 여백을 빼서 입력 칸이 자판에 바로 붙게 한다
  const bottom = keyboardVisible ? spacing[8] : insets.bottom + spacing[8];

  return (
    // 배경 없이 목록 위에 뜬다. 입력 칸·버튼 밖을 누르면 아래 목록이 받는다
    <View style={[styles.wrap, { paddingBottom: bottom }]} pointerEvents="box-none">
      {check === 'tooLong' ? (
        <Text style={[typography.caption, styles.warning]} accessibilityLiveRegion="polite">
          {`${MESSAGE_MAX_LENGTH.toLocaleString('ko-KR')}자까지 보낼 수 있어요`}
        </Text>
      ) : null}
      <View style={styles.row}>
        <TextInput
          {...caret}
          value={text}
          onChangeText={setText}
          placeholder="메시지 보내기"
          placeholderTextColor={colors.text.sub}
          multiline
          editable={!disabled}
          style={styles.input}
          // 안드로이드 여러 줄 입력은 글자가 위에 붙고 글꼴 여백이 더해져 placeholder가 잘린다. 가운데로 두고 여백을 뺀다
          textAlignVertical="center"
          accessibilityLabel="메시지 입력"
        />
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="보내기"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={send}
          style={({ pressed }) => [
            styles.send,
            !canSend && styles.sendDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Icon name="send" size={20} color={colors.text.inverse} />
        </PressableScale>
      </View>
    </View>
  );
}

/** 입력 칸 높이 44. 한 줄일 때 글자 줄 높이 24를 가운데에 둔다 */
const INPUT_MIN_HEIGHT = 44;
const LINE_HEIGHT = 22;

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing[12],
    paddingTop: spacing[8],
    gap: spacing[4],
  },
  warning: { color: colors.status.danger, paddingHorizontal: spacing[16] },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing[10] },
  input: {
    flex: 1,
    minHeight: INPUT_MIN_HEIGHT,
    maxHeight: 120,
    paddingHorizontal: spacing[16],
    paddingTop: (INPUT_MIN_HEIGHT - LINE_HEIGHT) / 2,
    paddingBottom: (INPUT_MIN_HEIGHT - LINE_HEIGHT) / 2,
    borderRadius: radius.xxl,
    backgroundColor: colors.surface.default,
    color: colors.text.default,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: LINE_HEIGHT,
    includeFontPadding: false,
  },
  send: {
    width: 40,
    height: 40,
    marginBottom: 2,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.primary,
  },
  sendDisabled: { backgroundColor: colors.gray[300] },
  pressed: { opacity: 0.7 },
});
