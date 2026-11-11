import { type ReactNode, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';

import { caret, colors, radius, spacing, typography } from '@/theme';

export type TextFieldProps = TextInputProps & {
  /** 칸 위 작은 이름. "여행 이름" */
  label?: string;
  /** 이름 옆 '필수' 표시 */
  required?: boolean;
  /** 칸 아래 설명. 오류가 있으면 오류가 대신 보인다 */
  helper?: string;
  /** 오류 문구. 있으면 밑줄이 빨갛게 바뀐다 */
  error?: string;
  /** 새 여행 이름처럼 크게 쓰는 입력 */
  large?: boolean;
  /**
   * 최대 글자 수. 넘게 입력되지 않고 오른쪽 아래에 "12/200"이 보인다.
   * 서버 규칙: 여행 이름 200, 닉네임 50 (앞뒤 공백 뺀 길이)
   */
  maxLength?: number;
  /** maxLength가 있어도 "12/200" 글자 수를 숨긴다. 금액처럼 쉼표가 섞여 글자 수가 뜻이 없을 때 */
  hideCount?: boolean;
  /**
   * underline 밑줄(S16·S19 이름 입력) / filled 회색 상자(S11 링크, S34 한 줄 평가, S35 금액·항목)
   */
  variant?: 'underline' | 'filled';
  /** filled 칸 안 오른쪽에 붙는 것. 금액의 "원", 붙여넣기 버튼 */
  trailing?: ReactNode;
  /** filled 회색 상자 자체의 스타일. 높이를 바꿀 때(S11 링크 칸 52) 쓴다. `style`은 안쪽 글자 입력에 붙는다 */
  boxStyle?: ViewStyle;
};

/** 입력칸. 기본은 밑줄 모양, `variant="filled"`면 회색 상자 모양이다. */
export function TextField({
  label,
  required,
  helper,
  error,
  large = false,
  maxLength,
  hideCount = false,
  variant = 'underline',
  trailing,
  boxStyle,
  onFocus,
  onBlur,
  ...inputProps
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const filled = variant === 'filled';
  const lineColor = error
    ? colors.status.dangerMid
    : focused
      ? colors.brand.primary
      : filled
        ? 'transparent'
        : colors.line.strong;
  const message = error ?? helper;
  const length = inputProps.value?.length ?? 0;
  const showCount = maxLength !== undefined && !hideCount;
  const atLimit = maxLength !== undefined && length >= maxLength;

  return (
    <View style={styles.wrap}>
      {label ? (
        <View style={styles.labelRow}>
          <Text style={[typography.captionMedium, styles.label]}>{label}</Text>
          {required ? <Text style={[typography.micro, styles.required]}>필수</Text> : null}
        </View>
      ) : null}
      {filled ? (
        <View
          style={[
            styles.box,
            large && styles.boxLarge,
            inputProps.multiline && styles.boxMultiline,
            { borderColor: lineColor },
            boxStyle,
          ]}
        >
          <TextInput
            {...caret}
            {...inputProps}
            maxLength={maxLength}
            placeholderTextColor={colors.text.sub}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            style={[
              large ? styles.boxInputLarge : styles.boxInput,
              inputProps.multiline && styles.boxInputMultiline,
              styles.noWebFocusRing,
              inputProps.style,
            ]}
          />
          {trailing}
        </View>
      ) : (
        <TextInput
          {...caret}
          {...inputProps}
          maxLength={maxLength}
          placeholderTextColor={colors.text.muted}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            large ? styles.inputLarge : styles.input,
            { borderBottomColor: lineColor, borderBottomWidth: focused || error ? 2 : 1 },
            styles.noWebFocusRing,
            inputProps.style,
          ]}
        />
      )}
      {message || showCount ? (
        <View style={styles.footer}>
          <Text style={[typography.caption, error ? styles.error : styles.helper, styles.message]}>
            {message ?? ''}
          </Text>
          {showCount ? (
            <Text style={[typography.caption, atLimit ? styles.error : styles.helper]}>
              {length}/{maxLength}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing[6] },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  label: { color: colors.text.sub },
  required: {
    color: colors.brand.primary,
    backgroundColor: colors.brand.primaryBg,
    paddingHorizontal: spacing[6],
    paddingVertical: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  // 안드로이드 입력칸 글자 높이
  // - lineHeight를 주면 한글(Noto Sans KR)의 위아래가 잘린다(placeholder 포함). 그래서 주지 않는다
  // - 기본으로 글꼴의 위아래 여유 공간까지 높이에 넣어(includeFontPadding) Noto Sans KR에서는 칸이 지나치게
  //   커진다. 여유 공간을 빼고 글자를 세로 가운데에 둔다. iOS에는 영향이 없는 속성이다
  input: {
    fontFamily: typography.bodyMedium.fontFamily,
    fontSize: typography.bodyMedium.fontSize,
    color: colors.text.default,
    paddingVertical: spacing[10],
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  inputLarge: {
    fontFamily: typography.title1.fontFamily,
    fontSize: 22,
    color: colors.text.default,
    paddingVertical: spacing[10],
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    minHeight: 48,
    paddingHorizontal: spacing[16],
    borderRadius: radius.md,
    borderWidth: 1.5,
    backgroundColor: colors.surface.default,
  },
  boxLarge: { minHeight: 56 },
  boxMultiline: { alignItems: 'flex-start', minHeight: 88, paddingVertical: spacing[14] },
  // 웹 입력칸은 기본 폭이 있어 줄어들지 않는다. 최소 폭 0이어야 trailing("원", 붙여넣기)이 밀려나지 않는다
  // 회색 상자도 밑줄 칸과 같이 lineHeight를 주지 않는다(안드로이드에서 예시 글자 윗부분이 잘림)
  boxInput: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    flex: 1,
    minWidth: 0,
    color: colors.text.default,
    paddingVertical: 0,
    // 상자 높이를 꽉 채워야 입력한 글자가 위로 밀려 사라지지 않는다(안드로이드)
    alignSelf: 'stretch',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  boxInputLarge: {
    fontFamily: typography.title1.fontFamily,
    fontSize: typography.title1.fontSize,
    flex: 1,
    minWidth: 0,
    color: colors.text.default,
    paddingVertical: 0,
    // 상자 높이를 꽉 채워야 입력한 글자가 위로 밀려 사라지지 않는다(안드로이드)
    alignSelf: 'stretch',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  boxInputMultiline: { textAlignVertical: 'top' },
  // 웹 미리보기에서 브라우저가 입력칸에 기본 포커스 테두리(주황)를 그린다. 디자인에 없고 앱(안드로이드)에도 없다.
  // 입력 중 표시는 밑줄·상자 테두리 색(brand.primary)으로 한다
  // RN 스타일 타입은 outlineStyle에 'none'이 없지만 웹(react-native-web)은 그대로 CSS로 넘긴다.
  // outline: auto는 폭 0을 무시해서 'none'이어야 사라진다
  noWebFocusRing: (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as TextStyle,
  footer: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing[8] },
  message: { flex: 1 },
  helper: { color: colors.text.muted },
  error: { color: colors.status.danger },
});
