import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Header, Icon, type IconName, TextField, toast } from '@/components/ui';
import { colors, layout, radius, spacing, typography } from '@/theme';

import {
  getPreferences,
  removeInferredPreference,
  savePreferences,
  setTripPreferenceConsent,
} from '../api';
import { ChosenChip, InferredChip, SuggestChip, ToggleChip } from '../components/preference-chips';
import {
  KEYWORD_MAX_LENGTH,
  QUICK_KEYWORDS,
  SUGGESTED_KEYWORDS,
  addKeyword,
  fromExplicitItems,
  normalizeKeyword,
  toExplicitItems,
} from '../preference-rules';
import type { PreferenceItem, Preferences } from '../types';

const PREFERENCES_KEY = ['me', 'preferences'] as const;

const ADD_PROBLEM: Record<'empty' | 'duplicate' | 'full', string> = {
  empty: `1~${KEYWORD_MAX_LENGTH}자로 적어 주세요`,
  duplicate: '이미 고른 취향이에요',
  full: '취향은 20개까지 고를 수 있어요',
};

/**
 * S03 취향 입력. 두 곳에서 연다.
 * - 가입 흐름: S02 저장 뒤, 또는 S04 참여 뒤(첫 가입). [완료]·[나중에] 모두 홈(S05)으로.
 *   초대로 왔으면 S17 여행 상세로 가야 하지만 아직 화면이 없어 홈으로 간다
 * - 추천 직전: `?from=recommendation&tripId=…`. 동행 추천에 쓸지도 고르고 [추천 보기]로 돌아간다
 * 상태: 기본 / 추천 직전 / 저장 실패(토스트 + [다시 시도])
 *
 * 2026-11-04 기준 백엔드에 /me/preferences가 없어 불러오기는 빈 취향으로 시작하고 저장은 실패한다.
 */
export function PreferencesScreen() {
  const { from, tripId } = useLocalSearchParams<{ from?: string; tripId?: string }>();
  const forRecommendation = from === 'recommendation' && Boolean(tripId);
  const prefs = useQuery({ queryKey: PREFERENCES_KEY, queryFn: getPreferences, retry: false });

  if (prefs.isPending) {
    return (
      <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
        <Header title="취향 입력" />
        <ActivityIndicator style={styles.flex} color={colors.brand.primary} />
      </SafeAreaView>
    );
  }

  // 불러오지 못해도(네트워크 등) 빈 취향으로 고를 수 있게 한다. 저장할 때 다시 알린다
  return (
    <PreferencesForm
      initial={prefs.data ?? null}
      forRecommendation={forRecommendation}
      tripId={tripId}
    />
  );
}

function PreferencesForm({
  initial,
  forRecommendation,
  tripId,
}: {
  initial: Preferences | null;
  forRecommendation: boolean;
  tripId?: string;
}) {
  const queryClient = useQueryClient();
  // 내 취향에 보이는 칩(순서 유지)과 그중 체크를 푼 것. 저장은 체크된 것만 한다.
  // 체크를 풀어도 칩은 남아서 다시 누르면 되돌릴 수 있다
  const [listed, setListed] = useState<string[]>(() => fromExplicitItems(initial?.explicitItems));
  const [unchecked, setUnchecked] = useState<string[]>([]);
  const chosen = listed.filter((w) => !unchecked.includes(w));
  const [inferred, setInferred] = useState<PreferenceItem[]>(initial?.inferredItems ?? []);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string>();
  // 추천 직전: 동행 추천에 쓸지. 기본은 함께 쓰기(피그마)
  const [shareWithCompanions, setShareWithCompanions] = useState(true);

  // 추천 직전이면 추천 화면으로 돌아간다. 링크로 바로 열어 돌아갈 곳이 없으면 홈으로
  const leave = () => {
    if (forRecommendation && router.canGoBack()) router.back();
    else router.replace('/home');
  };

  const save = useMutation({
    mutationFn: async () => {
      const saved = await savePreferences({
        explicitItems: toExplicitItems(chosen),
        allowInference: initial?.allowInference ?? true,
        // 처음 저장이면 결정 D-17대로 NONE. 여행별 동의는 추천 직전에 따로 묻는다
        sharingScope: initial?.sharingScope ?? 'NONE',
      });
      if (forRecommendation && tripId) {
        await setTripPreferenceConsent(
          tripId,
          shareWithCompanions ? 'EXPLICIT_AND_INFERRED' : 'NONE',
        );
      }
      return saved;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(PREFERENCES_KEY, saved);
      leave();
    },
    onError: () =>
      toast.error('취향을 저장하지 못했어요', {
        action: { label: '다시 시도', onPress: () => save.mutate() },
      }),
  });

  const removeInferred = useMutation({
    mutationFn: (item: PreferenceItem) => removeInferredPreference(item.key),
    onMutate: (item) => setInferred((list) => list.filter((i) => i.key !== item.key)),
    onError: (_error, item) => {
      setInferred((list) => [...list, item]);
      toast.error('취향을 빼지 못했어요. 다시 시도해 주세요');
    },
  });

  const setChecked = (word: string, checked: boolean) =>
    setUnchecked((list) => (checked ? list.filter((w) => w !== word) : [...list, word]));

  const add = (input: string) => {
    // 체크를 풀어 둔 칩을 다시 쓰거나 고르면 새로 만들지 않고 체크만 되돌린다
    const word = normalizeKeyword(input);
    const existing = word && listed.find((w) => w.toLowerCase() === word.toLowerCase());
    if (existing && unchecked.includes(existing)) {
      setChecked(existing, true);
      setDraftError(undefined);
      return true;
    }
    const result = addKeyword(listed, input);
    if (!result.ok) {
      setDraftError(ADD_PROBLEM[result.reason]);
      return false;
    }
    setListed(result.keywords);
    setDraftError(undefined);
    return true;
  };

  const toggle = (word: string) =>
    listed.includes(word) ? setChecked(word, unchecked.includes(word)) : add(word);
  const suggestions = SUGGESTED_KEYWORDS.filter((w) => !listed.includes(w));

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <Header
        title="취향 입력"
        right={
          <Pressable
            accessibilityRole="button"
            onPress={leave}
            style={({ pressed }) => [styles.later, pressed && styles.pressed]}
          >
            <Text style={[typography.bodyMedium, styles.laterText]}>나중에</Text>
          </Pressable>
        }
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, forRecommendation && styles.contentTight]}
          keyboardShouldPersistTaps="handled"
        >
          {forRecommendation ? (
            <View style={styles.notice}>
              <Icon name="bulb" size={20} color={colors.text.icon} />
              <Text style={[typography.body, styles.text]}>다 고르면 추천으로 돌아가요</Text>
            </View>
          ) : null}

          <View style={styles.headline}>
            <Text style={[typography.title1, styles.text]}>어떤 여행을 좋아하세요?</Text>
            {forRecommendation && chosen.length === 0 ? (
              <Text style={[typography.body, styles.sub]}>추천에 쓸 취향이 아직 없어요.</Text>
            ) : null}
          </View>

          {forRecommendation ? (
            <>
              <View style={styles.chips}>
                {[...QUICK_KEYWORDS, ...listed.filter((w) => !QUICK_KEYWORDS.includes(w))].map(
                  (word) => (
                    <ToggleChip
                      key={word}
                      label={word}
                      selected={chosen.includes(word)}
                      onToggle={() => toggle(word)}
                    />
                  ),
                )}
              </View>
              <View style={styles.section}>
                <Text style={[typography.bodyBold, styles.text]}>동행 추천에 쓸까요?</Text>
                <View style={styles.radios}>
                  <RadioRow
                    icon="people"
                    title="동행과 함께 쓰기"
                    description="추천 이유에 내 얼굴과 취향이 보여요"
                    selected={shareWithCompanions}
                    onPress={() => setShareWithCompanions(true)}
                  />
                  <RadioRow
                    icon="lock"
                    title="나만 보기"
                    description="그룹 추천에는 쓰지 않아요"
                    selected={!shareWithCompanions}
                    onPress={() => setShareWithCompanions(false)}
                  />
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={styles.addRow}>
                <View style={styles.flex}>
                  <TextField
                    variant="filled"
                    value={draft}
                    onChangeText={(v) => {
                      setDraft(v);
                      setDraftError(undefined);
                    }}
                    placeholder="직접 쓰기 (예: 온천, 전시)"
                    maxLength={KEYWORD_MAX_LENGTH}
                    hideCount
                    error={draftError}
                    returnKeyType="done"
                    onSubmitEditing={() => add(draft) && setDraft('')}
                    accessibilityLabel="취향 직접 쓰기"
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => add(draft) && setDraft('')}
                  style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
                >
                  <Text style={[typography.bodyMedium, styles.addText]}>추가</Text>
                </Pressable>
              </View>

              <View style={styles.section}>
                <Text style={[typography.bodyBold, styles.text]}>내 취향</Text>
                {listed.length || inferred.length ? (
                  <View style={styles.chips}>
                    {listed.map((word) => (
                      <ChosenChip
                        key={word}
                        label={word}
                        selected={!unchecked.includes(word)}
                        onToggle={() => setChecked(word, unchecked.includes(word))}
                      />
                    ))}
                    {inferred.map((item) => (
                      <InferredChip
                        key={item.key}
                        label={item.value}
                        onRemove={() => removeInferred.mutate(item)}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={[typography.caption, styles.sub]}>
                    아래에서 고르거나 직접 써서 더해요
                  </Text>
                )}
                {inferred.length ? (
                  <Text style={[typography.caption, styles.hint]}>
                    연한 칩은 저장한 장소로 찾은 취향이에요. 아니면 빼 주세요
                  </Text>
                ) : null}
              </View>

              {suggestions.length ? (
                <View style={[styles.section, styles.sectionWide]}>
                  <Text style={[typography.bodyBold, styles.text]}>이런 취향은 어때요?</Text>
                  <View style={styles.chips}>
                    {suggestions.map((word) => (
                      <SuggestChip key={word} label={word} onAdd={() => add(word)} />
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>

        <View style={styles.bottom}>
          <Button
            label={forRecommendation ? '추천 보기' : '완료'}
            size="xl"
            block
            loading={save.isPending}
            leading={
              forRecommendation ? (
                <Icon name="bulb" size={20} color={colors.text.inverse} />
              ) : undefined
            }
            onPress={() => save.mutate()}
            style={styles.done}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RadioRow({
  icon,
  title,
  description,
  selected,
  onPress,
}: {
  icon: IconName;
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      onPress={onPress}
      style={({ pressed }) => [styles.radioRow, pressed && styles.pressed]}
    >
      <View style={[styles.radio, selected ? styles.radioOn : styles.radioOff]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.flex}>
        <View style={styles.radioTitle}>
          <Icon name={icon} size={18} color={colors.text.icon} />
          <Text style={[typography.body, styles.text]}>{title}</Text>
        </View>
        <Text style={[typography.caption, styles.sub]}>{description}</Text>
      </View>
    </Pressable>
  );
}

const RADIO = 22;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[20],
    paddingBottom: spacing[24],
    gap: spacing[32],
  },
  contentTight: { paddingTop: spacing[16], gap: spacing[28] },
  later: { paddingHorizontal: spacing[12], height: 44, justifyContent: 'center' },
  laterText: { color: colors.brand.primaryDark },
  pressed: { opacity: 0.7 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    padding: spacing[16],
    borderRadius: radius.xl,
    backgroundColor: colors.surface.subtle,
  },
  headline: { gap: spacing[8] },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
  hint: { color: colors.text.icon },
  addRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[8] },
  addButton: {
    height: 48,
    paddingHorizontal: spacing[20],
    borderRadius: radius.md,
    backgroundColor: colors.text.default,
    justifyContent: 'center',
  },
  addText: { color: colors.text.inverse },
  section: { gap: spacing[12] },
  sectionWide: { gap: spacing[18] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[10] },
  radios: { gap: spacing[6], paddingTop: spacing[4] },
  radioRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[14], minHeight: 52 },
  radio: {
    width: RADIO,
    height: RADIO,
    borderRadius: RADIO / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioOn: { backgroundColor: colors.brand.primary },
  radioOff: { backgroundColor: colors.line.default },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surface.white },
  radioTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  bottom: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[12],
    paddingBottom: spacing[24],
  },
  done: { borderRadius: radius.lg },
});
