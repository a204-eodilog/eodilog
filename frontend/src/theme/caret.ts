import { Platform } from 'react-native';

import { colors } from './colors';

/**
 * 입력칸 커서와 글자 선택 색. 모든 TextInput에 `{...caret}`로 붙인다.
 *
 * 주지 않으면 안드로이드는 기기 기본색(청록)으로 커서와 선택 손잡이를 그려 앱 파란색과 따로 논다.
 * - 커서·선택 손잡이: 앱 파란색
 * - 선택한 글자 바탕: 안드로이드는 준 색을 그대로 칠하므로 연한 파랑을 준다.
 *   iOS는 이 색으로 커서를 그리고 바탕은 알아서 옅게 칠하므로 앱 파란색을 준다
 */
export const caret = {
  cursorColor: colors.brand.primary,
  selectionHandleColor: colors.brand.primary,
  selectionColor: Platform.OS === 'android' ? colors.brand.primaryLight : colors.brand.primary,
} as const;
