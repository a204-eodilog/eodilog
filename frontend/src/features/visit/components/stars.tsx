import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui';
import { colors, layout } from '@/theme';

const SCORES = [1, 2, 3, 4, 5] as const;

/** 고른 별은 진한 남색으로 채우고, 나머지는 연한 회색 테두리(피그마 S34) */
const FILLED = colors.text.default;
const EMPTY = colors.gray[300];

type StarInputProps = {
  /** 1~5. 아직 안 골랐으면 null */
  value: number | null;
  onChange: (score: number) => void;
  disabled?: boolean;
};

/** S34 별점 입력. 별 5개, 한 칸 누르는 영역 44, 별 36. 1점 단위(결정 Q-7) */
export function StarInput({ value, onChange, disabled = false }: StarInputProps) {
  return (
    <View style={styles.input} accessibilityRole="radiogroup" accessibilityLabel="별점">
      {SCORES.map((score) => {
        const on = value !== null && score <= value;
        return (
          <Pressable
            key={score}
            accessibilityRole="radio"
            accessibilityLabel={`${score}점`}
            accessibilityState={{ checked: value === score, disabled }}
            disabled={disabled}
            onPress={() => onChange(score)}
            style={styles.cell}
          >
            <Icon name="star" size={36} color={on ? FILLED : EMPTY} filled={on} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** 카드 머리 줄의 작은 별 다섯 개. 별 14, 간격 1 */
export function StarRow({ score }: { score: number }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${score}점`}>
      {SCORES.map((s) => (
        <Icon
          key={s}
          name="star"
          size={14}
          color={s <= score ? FILLED : EMPTY}
          filled={s <= score}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { flexDirection: 'row' },
  cell: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 값 문서 간격 1은 토큰에 없어 숫자로 둔다
  row: { flexDirection: 'row', gap: 1 },
});
