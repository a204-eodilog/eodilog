import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Calendar, LocaleConfig, type DateData } from 'react-native-calendars';

import { BottomSheet, Button, Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { addDays, daysBetween, formatRange, seoulToday } from '@/lib/seoul-date';
import { colors, radius, spacing, typography } from '@/theme';

import { stayLabel } from '../trip-rules';
import type { DateRange } from '../types';

LocaleConfig.locales.ko = {
  monthNames: Array.from({ length: 12 }, (_, i) => `${i + 1}월`),
  monthNamesShort: Array.from({ length: 12 }, (_, i) => `${i + 1}월`),
  dayNames: ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'],
  dayNamesShort: ['일', '월', '화', '수', '목', '금', '토'],
  today: '오늘',
};
LocaleConfig.defaultLocale = 'ko';

type Props = {
  visible: boolean;
  value: DateRange | null;
  onClose: () => void;
  onDone: (range: DateRange | null) => void;
};

/**
 * S16 기간 시트. 시작일을 누른 뒤 끝날을 누른다(빠른 선택 칩은 2026-11-05 사용자 요청으로 뺐다).
 * 시작일만 고른 상태로는 [완료]를 누를 수 없다(시작·끝은 함께 있어야 한다).
 * 지난 날짜도 고를 수 있다. 다녀온 여행을 뒤늦게 만들어 사진·경비를 정리하는 경우가 있다(research R13).
 */
export function DateRangeSheet({ visible, value, onClose, onDone }: Props) {
  const [start, setStart] = useState<string | null>(value?.start ?? null);
  const [end, setEnd] = useState<string | null>(value?.end ?? null);
  const today = seoulToday();

  // 시트를 열 때마다 저장된 기간에서 다시 시작한다. 고르다 닫은 값은 버린다
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setStart(value?.start ?? null);
      setEnd(value?.end ?? null);
    }
  }

  const pick = (day: DateData) => {
    const date = day.dateString;
    if (!start || end || date < start) {
      setStart(date);
      setEnd(null);
      return;
    }
    setEnd(date);
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
  // 고른 기간은 버튼 글자 대신 달력 아래 한 줄로 보인다. 버튼에 넣으면 좁은 화면에서 두 줄로 접힌다
  const summary = complete
    ? `${formatRange(start, end)} / ${stayLabel(daysBetween(start, end))}`
    : start
      ? `${formatRange(start, start)}부터 끝나는 날을 골라 주세요`
      : '시작하는 날을 골라 주세요';

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      // 피그마 S16 기간 선택: 제목 18 줄 오른쪽에 글자 버튼, 맨 아래 꽉 찬 48 버튼 하나.
      // [나중에 정할게요]는 고른 기간을 비우는 보조 행동이라 제목 줄 글자 버튼으로 둔다(디자인 결정 §1)
      footer={
        <Button
          label="선택"
          icon="check"
          size="lg"
          block
          disabled={!complete}
          onPress={() => complete && onDone({ start, end })}
          style={styles.done}
        />
      }
    >
      <View style={styles.head}>
        <Text style={[typography.title3, styles.title]}>여행 기간</Text>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="나중에 정할게요"
          // 글자 줄 26에 위아래 9씩 넓혀 누르는 자리 44
          hitSlop={9}
          onPress={() => onDone(null)}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={[typography.bodyMedium, styles.later]}>나중에 정할게요</Text>
        </PressableScale>
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
      <View style={styles.summary} accessibilityLiveRegion="polite">
        <Icon
          name="calendar"
          size={16}
          color={complete ? colors.brand.primary : colors.text.muted}
        />
        <Text
          style={[typography.bodyMedium, complete ? styles.summaryText : styles.summaryHint]}
          numberOfLines={1}
        >
          {summary}
        </Text>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[12],
  },
  title: { color: colors.text.default },
  later: { color: colors.brand.primary },
  // 시트 아래 줄이 가로 줄이라 남은 폭을 다 채운다(피그마 꽉 찬 버튼)
  done: { flex: 1 },
  pressed: { opacity: 0.6 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    marginTop: spacing[12],
    paddingHorizontal: spacing[14],
    paddingVertical: spacing[12],
    borderRadius: radius.md,
    backgroundColor: colors.surface.subtle,
  },
  summaryText: { flex: 1, color: colors.text.default },
  summaryHint: { flex: 1, color: colors.text.muted },
});
