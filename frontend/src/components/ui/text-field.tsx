import { useState } from 'react';
import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';

import { colors, spacing, typography } from '@/theme';

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
};

/** 밑줄 입력칸. Figma S16·S19의 이름 입력과 같은 모양이다. */
export function TextField({
  label,
  required,
  helper,
  error,
  large = false,
  maxLength,
  onFocus,
  onBlur,
  ...inputProps
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const lineColor = error
    ? colors.status.dangerMid
    : focused
      ? colors.brand.primary
      : colors.line.strong;
  const message = error ?? helper;
  const length = inputProps.value?.length ?? 0;
  const atLimit = maxLength !== undefined && length >= maxLength;

  return (
    <View style={styles.wrap}>
      {label ? (
        <View style={styles.labelRow}>
          <Text style={[typography.captionMedium, styles.label]}>{label}</Text>
          {required ? <Text style={[typography.micro, styles.required]}>필수</Text> : null}
        </View>
      ) : null}
      <TextInput
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
          inputProps.style,
        ]}
      />
      {message || maxLength !== undefined ? (
        <View style={styles.footer}>
          <Text style={[typography.caption, error ? styles.error : styles.helper, styles.message]}>
            {message ?? ''}
          </Text>
          {maxLength !== undefined ? (
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
  footer: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing[8] },
  message: { flex: 1 },
  helper: { color: colors.text.muted },
  error: { color: colors.status.danger },
});
