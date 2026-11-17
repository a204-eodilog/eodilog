import { SCROLL_DECELERATION } from '@/theme/scroll';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Header, Icon, Stagger, TextField } from '@/components/ui';
import { FadeIn } from '@/components/ui/fade-in';
import { MascotTraveler } from '@/components/ui/mascot';
import { PressableScale } from '@/components/ui/pressable-scale';
import { formatRange } from '@/lib/seoul-date';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { getRegion } from '../api';
import { DateRangeSheet } from '../components/date-range-sheet';
import { ProfileIncompleteSheet } from '../components/profile-incomplete-sheet';
import { useCreateTrip } from '../hooks/use-create-trip';
import { toCreateBody, useNewTripDraft } from '../hooks/use-new-trip-draft';
import { primeRegion } from '../hooks/use-region-names';
import { shortRegionName } from '../trip-rules';
import { KeyboardLift } from '@/components/ui/keyboard-lift';

const TITLE_MAX = 200;
const LATER = '나중에 정할게요';
const TRAVELER_SIZE = 168;

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
      <KeyboardLift style={styles.flex}>
        <ScrollView
          decelerationRate={SCROLL_DECELERATION}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {/* 피그마 S16: 큰 질문 28, 아래 8 안내 15 */}
          <View style={styles.questionBlock}>
            {/* 큰 질문 → 안내가 한 줄씩 나타난다 */}
            <Stagger>
              <Text style={[typography.question, styles.question]}>
                어떤 여행을{'\n'}떠나시나요?
              </Text>
              <Text style={[typography.bodySmall, styles.hint]}>
                이름만 정하면 바로 시작할 수 있어요
              </Text>
            </Stagger>
          </View>

          <TextField
            large
            value={title}
            onChangeText={(text) => {
              setTitle(text);
              if (titleError) setTitleError(null);
            }}
            placeholder="겨울 바다 보러 가기"
            maxLength={TITLE_MAX}
            // 피그마 S16에는 글자 수가 없다. 200자 제한은 그대로 막는다
            hideCount
            error={shownTitleError}
            returnKeyType="done"
            accessibilityLabel="여행 이름"
          />

          <View style={styles.rows}>
            <ChoiceRow
              label="언제"
              value={range ? formatRange(range.start, range.end) : null}
              onPress={() => setRangeOpen(true)}
            />
            <ChoiceRow
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

          {/* 줄과 버튼 사이 빈 자리에서 여행자가 걷는다. 질문·입력 칸이 다 나타난 뒤에 올라온다 */}
          <FadeIn index={6} style={styles.traveler}>
            <MascotTraveler size={TRAVELER_SIZE} />
          </FadeIn>
        </ScrollView>

        {/* 안드로이드 하단 버튼 줄(내비게이션 바) 높이에 16을 더 띄운다. 바 높이만 주면 버튼이 바에 붙는다 */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing[16] }]}>
          <Button
            label={problem?.kind === 'failed' ? '다시 시도' : '여행 만들기'}
            icon={problem?.kind === 'failed' ? 'refresh' : 'plus'}
            size="xl"
            block
            loading={isPending}
            onPress={submit}
          />
        </View>
      </KeyboardLift>

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
  label,
  value,
  onPress,
}: {
  label: string;
  value: string | null;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value ?? LATER}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {/* 피그마 S16 줄: 이름 14(폭 64) · 값 17 · 오른쪽 화살표 16. 아이콘은 없다 */}
      <Text style={[typography.sub, styles.rowLabel]}>{label}</Text>
      <Text
        style={[typography.bodyLarge, value ? styles.rowValue : styles.rowLater]}
        numberOfLines={1}
      >
        {value ?? LATER}
      </Text>
      <Icon name="chevron-right" size={16} color={colors.text.muted} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  // 피그마 S16: 위 16, 묶음 사이 24
  body: {
    flexGrow: 1,
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    gap: spacing[24],
  },
  // 줄과 버튼 사이 남은 자리의 한가운데. 키보드가 올라오면 아래로 밀려 입력을 가리지 않는다
  traveler: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  questionBlock: { gap: spacing[8] },
  question: { color: colors.text.default },
  hint: { color: colors.text.sub2 },
  rows: { gap: spacing[12] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    // 피그마 S16 줄 높이 60
    minHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: colors.line.default,
  },
  pressed: { opacity: 0.6 },
  rowLabel: { color: colors.text.sub2, width: 64 },
  rowValue: { flex: 1, color: colors.text.default },
  rowLater: { flex: 1, color: colors.text.muted },
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
