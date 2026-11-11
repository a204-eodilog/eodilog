import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, toast } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

import { CLOSES_AT_ERROR_TEXT, closesAtLabel, validateClosesAt } from '../poll-rules';

type Props = {
  value: Date;
  onChange: (value: Date) => void;
  /** 시각 계산 기준. 테스트·미리보기에서 고정한다 */
  now?: Date;
};

/**
 * N8 마감 카드(Figma 385-1031). 마감 시각, 자동 확정 안내, [눌러서 마감 시각 바꾸기].
 * 바꾸기는 기기 기본 선택기로 날짜 → 시각 순서로 고른다(research R4). 웹에는 선택기가 없어 안내만 띄운다
 */
export function ClosesAtPicker({ value, onChange, now }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [iosOpen, setIosOpen] = useState(false);

  const apply = (picked: Date) => {
    const reason = validateClosesAt(picked, new Date());
    if (reason) {
      setError(CLOSES_AT_ERROR_TEXT[reason]);
      return;
    }
    setError(null);
    onChange(picked);
  };

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'date',
        minimumDate: new Date(),
        onChange: (event, date) => {
          if (event.type !== 'set' || !date) return;
          DateTimePickerAndroid.open({
            value: date,
            mode: 'time',
            is24Hour: true,
            onChange: (e2, time) => {
              if (e2.type === 'set' && time) apply(time);
            },
          });
        },
      });
      return;
    }
    if (Platform.OS === 'ios') {
      setIosOpen((v) => !v);
      return;
    }
    toast.show('기기에서 바꿀 수 있어요');
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.iconCircle}>
          <Icon name="calendar" size={20} color={colors.text.icon} />
        </View>
        <View style={styles.texts}>
          <Text style={styles.when}>{closesAtLabel(value, now ?? new Date())}</Text>
          <Text style={styles.note}>가장 많이 받은 곳으로 자동 확정돼요</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="마감 시각 바꾸기"
            onPress={open}
            // 글자 줄 20에 위아래 12씩 넓혀 누르는 자리 44
            hitSlop={spacing[12]}
            style={styles.linkRow}
          >
            <Icon name="pencil" size={14} color={colors.brand.primary} />
            <Text style={styles.link}>바꾸기</Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </View>
      {Platform.OS === 'ios' && iosOpen ? (
        <DateTimePicker
          value={value}
          mode="datetime"
          display="inline"
          minimumDate={new Date()}
          onChange={(event, date) => {
            if (event.type === 'set' && date) apply(date);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // 피그마: 면 #F4F6F9, 둥글기 24, 안쪽 18, 아이콘 원과 글자 사이 16
  card: {
    backgroundColor: colors.surface.default,
    borderRadius: radius.xxl,
    padding: spacing[18],
    gap: spacing[12],
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[16] },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.xl,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1 },
  // 피그마 14 Bold·20은 subBold와 같다. 안내 13·20과 링크 12·24는 가장 가까운 토큰 caption·captionMedium(12·20)을 쓴다
  when: { ...typography.subBold, color: colors.text.default, marginBottom: spacing[2] },
  note: { ...typography.caption, color: colors.text.icon },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing[4],
    paddingTop: spacing[2],
  },
  link: { ...typography.captionMedium, color: colors.brand.primary },
  error: { ...typography.caption, color: colors.status.danger },
});
