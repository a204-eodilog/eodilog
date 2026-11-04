import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Calendar, LocaleConfig, type DateData } from 'react-native-calendars';

import { BottomSheet, Button, Chip } from '@/components/ui';
import { addDays, formatRange, seoulToday } from '@/lib/seoul-date';
import { colors, spacing } from '@/theme';

import type { DateRange } from '../types';

LocaleConfig.locales.ko = {
  monthNames: Array.from({ length: 12 }, (_, i) => `${i + 1}월`),
  monthNamesShort: Array.from({ length: 12 }, (_, i) => `${i + 1}월`),
  dayNames: ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'],
  dayNamesShort: ['일', '월', '화', '수', '목', '금', '토'],
  today: '오늘',
};
LocaleConfig.defaultLocale = 'ko';

/** 빠른 선택: 시작일에서 며칠 뒤가 끝나는 날인지 */
const QUICK = [
  { label: '당일', nights: 0 },
  { label: '1박 2일', nights: 1 },
  { label: '2박 3일', nights: 2 },
];

type Props = {
  visible: boolean;
  value: DateRange | null;
  onClose: () => void;
  onDone: (range: DateRange | null) => void;
};

/**
 * S16 기간 시트. 시작일을 누른 뒤 끝날을 누르거나, 시작일을 고르고 빠른 선택 칩을 누른다.
 * 시작일만 고른 상태로는 [완료]를 누를 수 없다(시작·끝은 함께 있어야 한다).
 * 지난 날짜도 고를 수 있다. 다녀온 여행을 뒤늦게 만들어 사진·경비를 정리하는 경우가 있다(research R13).
 */
export function DateRangeSheet({ visible, value, onClose, onDone }: Props) {
  const [start, setStart] = useState<string | null>(value?.start ?? null);
  const [end, setEnd] = useState<string | null>(value?.end ?? null);
  const [nights, setNights] = useState<number | null>(null);
  const today = seoulToday();

  // 시트를 열 때마다 저장된 기간에서 다시 시작한다. 고르다 닫은 값은 버린다
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setStart(value?.start ?? null);
      setEnd(value?.end ?? null);
      setNights(null);
    }
  }

  const pick = (day: DateData) => {
    const date = day.dateString;
    if (nights !== null) {
      setStart(date);
      setEnd(addDays(date, nights));
      return;
    }
    if (!start || end || date < start) {
      setStart(date);
      setEnd(null);
      return;
    }
    setEnd(date);
  };

  const pickQuick = (n: number) => {
    setNights(n);
    if (start) setEnd(addDays(start, n));
  };

  const marked = useMemo(() => {
    if (!start) return {};
    const last = end ?? start;
    const days: Record<string, object> = {};
    for (let d = start; d <= last; d = addDays(d, 1)) {
      days[d] = {
        color: d === start || d === last ? colors.brand.primary : colors.brand.primaryBg,
        textColor: d === start || d === last ? colors.text.inverse : colors.brand.primaryDark,
        startingDay: d === start,
        endingDay: d === last,
      };
    }
    return days;
  }, [start, end]);

  const complete = start !== null && end !== null;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="여행 기간"
      // 시트 아래 줄은 가로로 놓이므로 주 버튼은 flex로 남은 폭을 채운다. 보조 행동은 글자 버튼(디자인 결정 §1)
      footer={
        <>
          <Button label="나중에 정할게요" variant="text" size="xl" onPress={() => onDone(null)} />
          <Button
            label={complete ? `${formatRange(start, end)} 선택` : '날짜를 골라 주세요'}
            size="xl"
            disabled={!complete}
            onPress={() => complete && onDone({ start, end })}
            style={styles.done}
          />
        </>
      }
    >
      <View style={styles.quick}>
        {QUICK.map((q) => (
          <Chip
            key={q.label}
            label={q.label}
            selected={nights === q.nights}
            onPress={() => pickQuick(q.nights)}
          />
        ))}
      </View>
      <Calendar
        markingType="period"
        markedDates={marked}
        // 고른 시작일의 달, 없으면 서울 기준 이번 달부터 보인다
        current={start ?? today}
        onDayPress={pick}
        monthFormat="yyyy년 M월"
        theme={{
          todayTextColor: colors.brand.primary,
          arrowColor: colors.text.default,
          monthTextColor: colors.text.default,
          textSectionTitleColor: colors.text.muted,
          dayTextColor: colors.text.default,
          textDisabledColor: colors.gray[300],
        }}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  quick: { flexDirection: 'row', alignItems: 'center', gap: spacing[8], marginBottom: spacing[8] },
  done: { flex: 1 },
});
