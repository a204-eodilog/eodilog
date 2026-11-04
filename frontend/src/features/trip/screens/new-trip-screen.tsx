import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Header, Icon, TextField, type IconName } from '@/components/ui';
import { formatRange } from '@/lib/seoul-date';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { getRegion } from '../api';
import { DateRangeSheet } from '../components/date-range-sheet';
import { ProfileIncompleteSheet } from '../components/profile-incomplete-sheet';
import { useCreateTrip } from '../hooks/use-create-trip';
import { toCreateBody, useNewTripDraft } from '../hooks/use-new-trip-draft';
import { primeRegion } from '../hooks/use-region-names';
import { shortRegionName } from '../trip-rules';

const TITLE_MAX = 200;
const LATER = '나중에 정할게요';

/** S16 새 여행 만들기. 이름만 있으면 만들 수 있고 기간·여행지는 나중에 정해도 된다(결정 F-11) */
export function NewTripScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { regionId } = useLocalSearchParams<{ regionId?: string }>();
  const { title, range, regions, setTitle, setRange, addRegion, reset } = useNewTripDraft();
  const [titleError, setTitleError] = useState<string | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);

  const { create, isPending, problem, clearProblem } = useCreateTrip({
    onCreated: (trip) => {
      reset();
      // 상세에서 뒤로 가면 이 화면이 아니라 들어온 곳으로 가도록 바꿔 끼운다
      router.replace({ pathname: '/trips/[tripId]', params: { tripId: trip.id } });
    },
  });

  // 여행지 정보(N3)의 [이 여행지로 새 여행]으로 들어오면 그 지역을 미리 넣는다
  useEffect(() => {
    if (!regionId) return;
    getRegion(regionId)
      .then((region) => {
        primeRegion(queryClient, region);
        addRegion(region);
      })
      .catch(() => undefined);
  }, [regionId, addRegion, queryClient]);

  // 헤더 X뿐 아니라 안드로이드 뒤로 버튼·뒤로 제스처로 나가도 입력을 버린다(US1-12).
  // 여행지 검색은 이 화면 위에 쌓이므로 이 화면이 남아 있고 입력도 그대로다
  useEffect(() => reset, [reset]);

  const close = () => router.back();

  const submit = () => {
    if (title.trim().length === 0) {
      setTitleError('여행 이름을 입력해 주세요');
      return;
    }
    setTitleError(null);
    create(toCreateBody({ title, range, regions }));
  };

  const shownTitleError = titleError ?? (problem?.kind === 'title' ? problem.message : undefined);

  return (
    <View style={styles.screen}>
      <Header close onBack={close} />
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={[typography.title1, styles.question]}>어떤 여행을{'\n'}떠나시나요?</Text>
          <Text style={[typography.body, styles.hint]}>이름만 정하면 바로 시작할 수 있어요</Text>

          <TextField
            large
            value={title}
            onChangeText={(text) => {
              setTitle(text);
              if (titleError) setTitleError(null);
            }}
            placeholder="예: 겨울 바다 보러 가기"
            maxLength={TITLE_MAX}
            error={shownTitleError}
            returnKeyType="done"
            accessibilityLabel="여행 이름"
          />

          <View style={styles.rows}>
            <ChoiceRow
              icon="calendar"
              label="언제"
              value={range ? formatRange(range.start, range.end) : null}
              onPress={() => setRangeOpen(true)}
            />
            <ChoiceRow
              icon="map-pin"
              label="어디로"
              value={
                regions.length > 0 ? regions.map((r) => shortRegionName(r.name)).join(', ') : null
              }
              onPress={() => router.push('/trips/new-region')}
            />
          </View>

          {problem?.kind === 'failed' ? (
            <View style={styles.failed} accessibilityLiveRegion="polite">
              <Icon name="alert" size={16} color={colors.status.danger} />
              <Text style={[typography.caption, styles.failedText]}>
                여행을 만들지 못했어요. 입력한 내용은 그대로 있어요. 다시 시도해 주세요
              </Text>
            </View>
          ) : null}
        </ScrollView>

        {/* 안드로이드 하단 버튼 줄(내비게이션 바) 높이에 16을 더 띄운다. 바 높이만 주면 버튼이 바에 붙는다 */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing[16] }]}>
          <Button
            label={problem?.kind === 'failed' ? '다시 시도' : '여행 만들기'}
            size="xl"
            block
            loading={isPending}
            onPress={submit}
          />
        </View>
      </KeyboardAvoidingView>

      <DateRangeSheet
        visible={rangeOpen}
        value={range}
        onClose={() => setRangeOpen(false)}
        onDone={(next) => {
          setRange(next);
          setRangeOpen(false);
        }}
      />
      <ProfileIncompleteSheet
        visible={problem?.kind === 'profileIncomplete'}
        onClose={clearProblem}
      />
    </View>
  );
}

function ChoiceRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: IconName;
  label: string;
  value: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value ?? LATER}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Icon name={icon} size={20} color={colors.text.sub} />
      <Text style={[typography.bodyMedium, styles.rowLabel]}>{label}</Text>
      <Text style={[typography.body, value ? styles.rowValue : styles.rowLater]} numberOfLines={1}>
        {value ?? LATER}
      </Text>
      <Icon name="chevron-right" size={20} color={colors.text.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  body: { paddingHorizontal: layout.screenPaddingX, paddingTop: spacing[8], gap: spacing[16] },
  question: { color: colors.text.default },
  hint: { color: colors.text.sub, marginTop: -spacing[8] },
  rows: { marginTop: spacing[8] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.line.default,
  },
  pressed: { opacity: 0.6 },
  rowLabel: { color: colors.text.default, width: 56 },
  rowValue: { flex: 1, color: colors.text.default, textAlign: 'right' },
  rowLater: { flex: 1, color: colors.text.muted, textAlign: 'right' },
  failed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    padding: spacing[12],
    borderRadius: radius.md,
    backgroundColor: colors.status.dangerBg,
  },
  failedText: { flex: 1, color: colors.status.danger },
  footer: { paddingHorizontal: layout.screenPaddingX, paddingTop: spacing[12] },
});
