import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '@/components/ui/spinner';
import { Calendar, LocaleConfig, type DateData } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, Icon, type IconName, Tag } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { formatTripNights, formatTripPeriod } from '@/lib/format-date';
import { addDays, seoulToday } from '@/lib/seoul-date';
import { colors, layout, radius, spacing, typography } from '@/theme';

// 여행 기간 시트(trip/date-range-sheet)와 같은 한국어 달력 표기
LocaleConfig.locales.ko = {
  monthNames: Array.from({ length: 12 }, (_, i) => `${i + 1}월`),
  monthNamesShort: Array.from({ length: 12 }, (_, i) => `${i + 1}월`),
  dayNames: ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'],
  dayNamesShort: ['일', '월', '화', '수', '목', '금', '토'],
  today: '오늘',
};
LocaleConfig.defaultLocale = 'ko';

function CheckLine({ text, state = 'done' }: { text: string; state?: 'done' | 'doing' | 'todo' }) {
  return (
    <View style={styles.checkLine}>
      {state === 'done' ? (
        <View style={styles.checkDot}>
          <Icon name="check" size={14} color={colors.status.success} />
        </View>
      ) : state === 'doing' ? (
        <Spinner size="small" color={colors.brand.primary} style={styles.spinner} />
      ) : (
        <View style={styles.todoDot} />
      )}
      <Text
        style={[
          state === 'doing' ? typography.bodyBold : typography.body,
          state === 'todo' ? styles.todoText : styles.checkText,
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

export { CheckLine };

type ChooseProps = {
  regionName: string;
  period: string;
  savedCount: number;
  onAuto(): void;
  onManual(): void;
  /** 자동 추천 요청을 보내는 중. 서버가 받으면 생성 중 화면으로 넘어간다 */
  autoBusy?: boolean;
  /** 모은 장소가 없어 자동 추천을 쓸 수 없다. 서버도 거절한다 */
  autoUnavailable?: boolean;
};

/** S23 구성 방식 선택(Figma 201-12269). "어떻게 짤까요?"는 작은 회색 소제목(디자인 결정) */
export function ChooseView({
  regionName,
  period,
  savedCount,
  onAuto,
  onManual,
  autoBusy = false,
  autoUnavailable = false,
}: ChooseProps) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[typography.bodyBold, styles.heading]}>이 내용으로 짜요</Text>
      <View style={styles.summary}>
        <CheckLine text={`여행지 ${regionName}`} />
        <CheckLine text={`기간 ${period}`} />
        <CheckLine text={`모은 장소 ${savedCount}곳`} />
      </View>
      <Text style={[typography.captionBold, styles.subHeading]}>어떻게 짤까요?</Text>
      <Option
        icon="bulb"
        title="자동 추천"
        tag="추천"
        body={autoUnavailable ? '모은 장소가 없어 쓸 수 없어요' : '모은 장소로 동선을 짜요'}
        onPress={onAuto}
        busy={autoBusy}
        disabled={autoBusy || autoUnavailable}
      />
      <Option
        icon="pencil"
        title="직접 만들기"
        body="모은 장소를 날짜별로 놓아요"
        onPress={onManual}
        disabled={autoBusy}
      />
    </ScrollView>
  );
}

function Option(props: {
  icon: IconName;
  title: string;
  tag?: string;
  body: string;
  onPress(): void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <PressableScale
      style={[styles.option, props.disabled && !props.busy && styles.optionOff]}
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: props.disabled, busy: props.busy }}
    >
      <View style={styles.optionIcon}>
        <Icon name={props.icon} size={22} color={colors.text.icon} />
      </View>
      <View style={styles.optionTexts}>
        <View style={styles.optionTitle}>
          <Text style={[typography.bodyBold, styles.heading]}>{props.title}</Text>
          {props.tag ? (
            <View>
              <Tag label={props.tag} tone="brandSoft" small />
            </View>
          ) : null}
        </View>
        <Text style={[typography.caption, styles.muted]}>{props.body}</Text>
      </View>
      {props.busy ? (
        <Spinner size="small" color={colors.brand.primary} />
      ) : (
        <Icon name="chevron-right" size={20} color={colors.text.muted} />
      )}
    </PressableScale>
  );
}

/** S23 여행지 미정(Figma 201-12377) */
export function NoRegionView({ onPickRegion }: { onPickRegion(): void }) {
  return (
    <View style={styles.center}>
      <View style={styles.badge}>
        <Icon name="map-pin" size={30} color={colors.text.icon} />
      </View>
      <Text style={[typography.title1, styles.centerTitle]}>여행지를 먼저 정해요</Text>
      <Text style={[typography.body, styles.centerBody]}>
        여행지가 정해지면{'\n'}날짜별 코스를 짤 수 있어요
      </Text>
      <Button
        label="여행지 정하기"
        size="lg"
        weight="medium"
        leading={<Icon name="check" size={20} color={colors.text.inverse} />}
        onPress={onPickRegion}
        style={styles.centerButton}
      />
    </View>
  );
}

type NoDatesProps = {
  regionName: string;
  value: { start: string; end: string | null } | null;
  onChange(value: { start: string; end: string | null }): void;
  onNext(): void;
  saving: boolean;
};

const QUICK = [
  { label: '당일', nights: 0 },
  { label: '1박 2일', nights: 1 },
  { label: '2박 3일', nights: 2 },
];

/** S23 기간 없음(Figma 201-12442). 달력과 [당일]·[1박 2일]·[2박 3일]로 기간을 넣는다 */
export function NoDatesView({ regionName, value, onChange, onNext, saving }: NoDatesProps) {
  const insets = useSafeAreaInsets();
  const today = seoulToday();
  const start = value?.start ?? null;
  const end = value?.end ?? null;

  const pick = (day: DateData) => {
    const date = day.dateString;
    if (!start || end || date < start) onChange({ start: date, end: null });
    else onChange({ start, end: date });
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

  const nights =
    start && end ? Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) : null;

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[typography.caption, styles.muted]}>기간을 넣으면 날짜별로 나눠 짜요</Text>
        <View style={styles.steps}>
          <CheckLine text={`여행지 ${regionName}`} />
          <CheckLine text="기간 넣기" state="doing" />
        </View>
        <Text style={[typography.title2, styles.heading]}>언제 가요?</Text>
        {start ? (
          <View style={styles.period}>
            <Icon name="calendar" size={18} color={colors.brand.primary} />
            <Text style={[typography.bodyMedium, styles.periodText]}>
              {[formatTripPeriod(start, end ?? start), end ? formatTripNights(start, end) : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        ) : null}
        <View style={styles.quick}>
          {QUICK.map((q) => (
            <Chip
              key={q.label}
              label={q.label}
              size="sm"
              selected={nights === q.nights}
              onPress={() => {
                const from = start ?? today;
                onChange({ start: from, end: addDays(from, q.nights) });
              }}
            />
          ))}
        </View>
        <View style={styles.calendar}>
          <Calendar
            markingType="period"
            markedDates={marked}
            current={start ?? today}
            minDate={today}
            onDayPress={pick}
            monthFormat="yyyy년 M월"
            theme={{
              calendarBackground: colors.surface.default,
              todayTextColor: colors.brand.primary,
              arrowColor: colors.text.default,
              monthTextColor: colors.text.default,
              textSectionTitleColor: colors.text.muted,
              dayTextColor: colors.text.default,
              textDisabledColor: colors.gray[300],
            }}
          />
        </View>
      </ScrollView>
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, spacing[16]) }]}>
        <Button
          label="다음"
          size="lg"
          weight="medium"
          onPress={onNext}
          disabled={!start || !end}
          loading={saving}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[20],
    paddingBottom: spacing[24],
    gap: spacing[14],
  },
  heading: { color: colors.text.default },
  subHeading: { color: colors.text.sub, marginTop: spacing[14] },
  muted: { color: colors.text.sub },
  summary: {
    gap: spacing[12],
    padding: spacing[18],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  steps: { gap: spacing[12] },
  checkLine: { flexDirection: 'row', alignItems: 'center', gap: spacing[10] },
  checkDot: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: colors.status.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: { width: 22, height: 22 },
  todoDot: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 3,
    borderColor: colors.line.default,
    transform: [{ scale: 0.4 }],
  },
  checkText: { color: colors.text.icon },
  todoText: { color: colors.text.muted },
  optionOff: { opacity: 0.5 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[14],
    padding: spacing[18],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTexts: { flex: 1, gap: spacing[2] },
  optionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[32],
    paddingBottom: 110,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTitle: { color: colors.text.default, marginTop: spacing[20], textAlign: 'center' },
  centerBody: { color: colors.text.icon, marginTop: spacing[8], textAlign: 'center' },
  centerButton: { alignSelf: 'center', marginTop: spacing[24] },
  period: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  periodText: { color: colors.brand.primary },
  quick: { flexDirection: 'row', gap: spacing[8] },
  calendar: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface.default,
    padding: spacing[8],
  },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: spacing[12],
    paddingHorizontal: layout.screenPaddingX,
    backgroundColor: colors.surface.white,
  },
});
