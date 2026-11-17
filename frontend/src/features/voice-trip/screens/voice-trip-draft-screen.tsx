import { randomUUID } from 'expo-crypto';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet, Button, ConfirmSheet, ErrorState, Header, Icon } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { DateRangeSheet } from '@/features/trip/components/date-range-sheet';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { CandidateSheet } from '../components/candidate-sheet';
import { FixSheet } from '../components/fix-sheet';
import { useCreateFromVoice } from '../hooks/use-create-from-voice';
import {
  clearVoiceTrip,
  retryVoiceTrip,
  setWatchingDraft,
  updateDraft,
  useVoiceTrip,
} from '../voice-trip-store';
import {
  addPicked,
  applyFix,
  dayDateLabel,
  dayItems,
  itemName,
  NO_CHANGE,
  rangeLabel,
  removeItem,
  replaceItem,
  stepRows,
  withDates,
  type AiPlace,
  type Changed,
  type TripJobView,
  type TripVoiceDraft,
  type VoiceItem,
} from '../voice-trip-rules';

/** 실험: 말로 새 여행 만들기 2단계. 정리 중 → 초안 확인·고치기 → [여행 만들기] */
export function VoiceTripDraftScreen() {
  const state = useVoiceTrip();

  // 이 화면을 보는 동안에는 "초안이 준비됐어요" 안내를 띄우지 않는다
  useFocusEffect(
    useCallback(() => {
      setWatchingDraft(true);
      return () => setWatchingDraft(false);
    }, []),
  );

  if (state.kind === 'ready') return <DraftView draft={state.draft} />;

  return (
    <View style={styles.screen}>
      <Header close onBack={() => router.back()} title="말로 만들기" />
      {state.kind === 'failed' ? (
        <View style={styles.flex}>
          <ErrorState
            title="정리하지 못했어요"
            description={state.message}
            retryLabel={state.canRetry ? '다시 보내기' : '다시 말하기'}
            onRetry={() => {
              if (state.canRetry) retryVoiceTrip();
              else {
                clearVoiceTrip();
                router.replace('/trips/new-voice');
              }
            }}
          />
        </View>
      ) : state.kind === 'idle' ? (
        <View style={styles.flex}>
          <ErrorState
            title="정리할 말이 없어요"
            description="다시 말해 주세요"
            retryLabel="말하기"
            onRetry={() => router.replace('/trips/new-voice')}
          />
        </View>
      ) : (
        <Organizing job={state.kind === 'running' ? state.job : null} />
      )}
    </View>
  );
}

function Organizing({ job }: { job: TripJobView | null }) {
  const rows = job
    ? stepRows(job)
    : [
        { label: '말 보내는 중', state: 'now' as const },
        ...stepRows({ step: 'TRANSCRIBING', searched: 0, toSearch: 0 }).map((r) => ({
          ...r,
          state: 'wait' as const,
        })),
      ];
  return (
    <View style={styles.organize}>
      <View style={styles.organizeIcon}>
        <Icon name="mic" size={44} color={colors.brand.primary} />
      </View>
      <Text style={[typography.heading, styles.center]}>여행으로 정리하고 있어요</Text>
      <View style={styles.steps}>
        {rows.map((r) => (
          <View key={r.label} style={styles.stepRow}>
            {r.state === 'now' ? (
              <ActivityIndicator size="small" color={colors.brand.primary} />
            ) : (
              <Icon
                name={r.state === 'done' ? 'check' : 'clock'}
                size={18}
                color={r.state === 'done' ? colors.status.success : colors.text.muted}
              />
            )}
            <Text
              style={[
                typography.bodySmall,
                r.state === 'done' && styles.stepDone,
                r.state === 'now' && styles.stepNow,
                r.state === 'wait' && styles.stepWait,
              ]}
            >
              {r.label}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[typography.caption, styles.organizeHint]}>
        10분 말하면 1분쯤 걸려요. 다른 화면으로 가도 괜찮아요. 다 되면 알려 드릴게요
      </Text>
      <Button label="다른 화면 보기" variant="neutral" size="lg" onPress={() => router.back()} />
    </View>
  );
}

type Edit =
  | { kind: 'title' }
  | { kind: 'destinations' }
  | { kind: 'dates' }
  | { kind: 'transcript' }
  | { kind: 'swap'; item: VoiceItem; near: { latitude: number; longitude: number } | null }
  | { kind: 'add'; day: number; near: { latitude: number; longitude: number } | null }
  | { kind: 'fix' }
  | { kind: 'needDates' }
  | { kind: 'discard' }
  | null;

function DraftView({ draft }: { draft: TripVoiceDraft }) {
  const insets = useSafeAreaInsets();
  const [edit, setEdit] = useState<Edit>(null);
  const [changed, setChanged] = useState<Changed>(NO_CHANGE);
  const [before, setBefore] = useState<TripVoiceDraft | null>(null);
  const { create, busy } = useCreateFromVoice();
  const close = () => setEdit(null);

  const set = (next: TripVoiceDraft) => {
    updateDraft(next);
    setChanged(NO_CHANGE);
  };

  const nearOf = (day: number, beforeKey?: string) => {
    const list = dayItems(draft, day);
    const at = beforeKey ? list.findIndex((i) => i.key === beforeKey) : list.length;
    for (let i = at - 1; i >= 0; i -= 1) {
      const p = list[i].place;
      if (p) return { latitude: p.latitude, longitude: p.longitude };
    }
    const own = beforeKey ? list[at]?.place : null;
    return own ? { latitude: own.latitude, longitude: own.longitude } : null;
  };

  const onCreate = () => {
    const placed = draft.items.some((i) => i.place);
    if (placed && !draft.startDate) {
      setEdit({ kind: 'needDates' });
      return;
    }
    void create(draft, true);
  };

  const destination = draft.destinations[0]?.name ?? null;
  const days = Array.from({ length: draft.dayCount }, (_, i) => i + 1);

  return (
    <View style={styles.screen}>
      <Header
        close
        onBack={() => setEdit({ kind: 'discard' })}
        title="새 여행 초안"
        right={
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="받아쓴 말 보기"
            onPress={() => setEdit({ kind: 'transcript' })}
            style={styles.headerLink}
          >
            <Text style={[typography.captionBold, styles.link]}>받아쓴 말</Text>
          </PressableScale>
        }
      />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.info}>
          <InfoRow label="이름" changed={changed.title}>
            <InlineText
              key={draft.title}
              value={draft.title}
              placeholder="여행 이름"
              maxLength={60}
              onCommit={(title) => {
                if (title) set({ ...draft, title, titleByAi: false });
              }}
            />
          </InfoRow>
          <InfoRow label="어디로" changed={changed.destinations}>
            <InlineText
              key={draft.destinations.map((d) => d.name).join(',')}
              value={draft.destinations.map((d) => d.name).join(', ')}
              placeholder="말하지 않았어요 · 눌러서 적기"
              maxLength={40}
              onCommit={(text) => {
                const names = text
                  .split(/[,，]/)
                  .map((v) => v.trim())
                  .filter(Boolean)
                  .slice(0, 3);
                set({ ...draft, destinations: names.map((name) => ({ name, said: null })) });
              }}
            />
          </InfoRow>
          <InfoRow
            label="언제"
            changed={changed.dates}
            onEdit={() => setEdit({ kind: 'dates' })}
            editLabel={draft.startDate ? '고치기' : '정하기'}
            last
          >
            {draft.startDate && draft.endDate ? (
              <>
                <Text style={[typography.bodyBold, styles.value]}>
                  {rangeLabel(draft.startDate, draft.endDate)}
                </Text>
              </>
            ) : (
              <Text style={[typography.bodySmall, styles.blank]}>
                말하지 않았어요{draft.dayCount > 1 ? ` · ${draft.dayCount}일로 나눴어요` : ''}
              </Text>
            )}
          </InfoRow>
        </View>

        {days.map((day) => {
          const list = dayItems(draft, day);
          const date = dayDateLabel(draft, day);
          return (
            <View key={day} style={styles.day}>
              <Text style={[typography.bodyBold, styles.dayTitle]}>
                {day}일차{date ? <Text style={styles.dayDate}> {date}</Text> : null}
              </Text>
              {list.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={[typography.bodySmall, styles.blank]}>말하지 않은 날이에요</Text>
                </View>
              ) : null}
              {list.map((item, index) => (
                <ItemRow
                  key={item.key}
                  item={item}
                  index={index}
                  changed={changed.keys.has(item.key)}
                  onSwap={() => setEdit({ kind: 'swap', item, near: nearOf(day, item.key) })}
                  onRemove={() => set(removeItem(draft, item.key))}
                />
              ))}
              <PressableScale
                accessibilityRole="button"
                onPress={() => setEdit({ kind: 'add', day, near: nearOf(day) })}
                style={styles.addRow}
              >
                <Icon name="plus" size={18} color={colors.brand.primary} />
                <Text style={[typography.captionBold, styles.link]}>{day}일차에 장소 넣기</Text>
              </PressableScale>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: insets.bottom + spacing[12] }]}>
        <View style={styles.flex}>
          <Button
            label="말로 고치기"
            variant="secondary"
            size="lg"
            block
            leading={<Icon name="mic" size={18} color={colors.brand.primary} />}
            onPress={() => setEdit({ kind: 'fix' })}
          />
        </View>
        <View style={styles.flex}>
          <Button
            label={busy ? '만드는 중' : '여행 만들기'}
            size="lg"
            block
            loading={!!busy}
            onPress={onCreate}
          />
        </View>
      </View>
      {busy ? (
        <View style={styles.busy} pointerEvents="none">
          <Text style={[typography.caption, styles.busyText]}>{busy}</Text>
        </View>
      ) : null}

      {/* 말로 고치기 */}
      {edit?.kind === 'fix' ? (
        <FixSheet
          visible
          draft={draft}
          onClose={close}
          onApply={(result) => {
            setBefore(draft);
            const out = applyFix(draft, result.ops);
            updateDraft(out.draft);
            setChanged(out.changed);
          }}
          onRevert={() => {
            if (before) updateDraft(before);
            setChanged(NO_CHANGE);
          }}
        />
      ) : null}

      {/* AI가 고른 곳 바꾸기 */}
      {edit?.kind === 'swap' ? (
        <CandidateSheet
          visible
          onClose={close}
          title={`${edit.item.label ? edit.item.label + ' · ' : ''}다른 곳으로 바꿀까요?`}
          initialQuery={edit.item.query}
          destination={destination}
          near={edit.near}
          current={edit.item.place}
          onPick={(place: AiPlace) => {
            set(replaceItem(draft, { ...edit.item, place, aiPicked: false }));
            close();
          }}
        />
      ) : null}

      {/* 손으로 장소 넣기 */}
      {edit?.kind === 'add' ? (
        <CandidateSheet
          visible
          onClose={close}
          title={`${edit.day}일차에 넣을 곳`}
          initialQuery={destination ? `${destination} ` : ''}
          destination={destination}
          near={edit.near}
          onPick={(place: AiPlace) => {
            set(addPicked(draft, edit.day, place, randomUUID()));
            close();
          }}
        />
      ) : null}

      {/* 날짜 */}
      <DateRangeSheet
        visible={edit?.kind === 'dates'}
        value={
          draft.startDate && draft.endDate ? { start: draft.startDate, end: draft.endDate } : null
        }
        onClose={close}
        onDone={(range) => {
          if (range) set(withDates(draft, range.start, range.end));
          else set({ ...draft, startDate: null, endDate: null, datesSaid: null });
          close();
        }}
      />

      {/* 받아쓴 말 */}
      <BottomSheet
        visible={edit?.kind === 'transcript'}
        onClose={close}
        title="받아쓴 말"
        titleVariant="title3"
        scrollable
      >
        <Text style={[typography.body, styles.value]}>{draft.transcript}</Text>
      </BottomSheet>

      {/* 날짜 없이 코스를 넣으려 할 때 */}
      <BottomSheet
        visible={edit?.kind === 'needDates'}
        onClose={close}
        title="코스를 넣으려면 날짜가 필요해요"
        description="날짜를 정하면 말한 코스까지 함께 넣어요. 날짜 없이 만들면 코스는 빼고 여행만 만들어요"
        descriptionVariant="caption"
        titleVariant="title3"
        footer={
          <View style={styles.sheetRow}>
            <View style={styles.flex}>
              <Button
                label="코스 없이 만들기"
                variant="neutral"
                size="lg"
                block
                onPress={() => {
                  close();
                  void create(draft, false);
                }}
              />
            </View>
            <View style={styles.flex}>
              <Button
                label="날짜 정하기"
                size="lg"
                block
                onPress={() => setEdit({ kind: 'dates' })}
              />
            </View>
          </View>
        }
      />

      <ConfirmSheet
        visible={edit?.kind === 'discard'}
        onClose={close}
        onConfirm={() => {
          close();
          clearVoiceTrip();
          router.back();
        }}
        title="초안을 버릴까요?"
        description="여행은 아직 만들지 않았어요. 버리면 말한 내용이 남지 않아요"
        confirmLabel="버리기"
        cancelLabel="계속 고치기"
      />
    </View>
  );
}

function InfoRow(props: {
  label: string;
  children: React.ReactNode;
  onEdit?: () => void;
  editLabel?: string;
  changed?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoRow, !props.last && styles.infoLine, props.changed && styles.changed]}>
      <Text style={[typography.caption, styles.infoLabel]}>{props.label}</Text>
      <View style={styles.infoValue}>{props.children}</View>
      {props.onEdit ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`${props.label} ${props.editLabel ?? '고치기'}`}
          onPress={props.onEdit}
          style={styles.editHit}
        >
          <Text style={[typography.captionBold, styles.link]}>{props.editLabel ?? '고치기'}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

function ItemRow(props: {
  item: VoiceItem;
  index: number;
  changed: boolean;
  onSwap: () => void;
  onRemove: () => void;
}) {
  const { item } = props;
  const when = [item.startTime, item.label].filter(Boolean).join(' ');
  return (
    <View style={[styles.item, props.changed && styles.changed]}>
      <View
        style={[styles.dot, !item.place && styles.dotEmpty, props.changed && styles.dotChanged]}
      >
        <Text style={[typography.captionBold, item.place ? styles.dotText : styles.dotTextEmpty]}>
          {item.place ? props.index + 1 : '?'}
        </Text>
      </View>
      <View style={styles.itemBody}>
        {when ? <Text style={[typography.caption, styles.when]}>{when}</Text> : null}
        {/* 장소 이름을 누르면 검색창이 있는 후보 목록에서 다른 곳으로 바꾼다 */}
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`${item.place ? itemName(item) : item.query} 바꾸기`}
          onPress={props.onSwap}
        >
          <Text style={[typography.bodyBold, item.place ? styles.value : styles.blank]}>
            {item.place ? itemName(item) : `'${item.query}' 못 찾았어요`}
          </Text>
        </PressableScale>
      </View>
      <SmallIcon name="close" label="빼기" onPress={props.onRemove} />
    </View>
  );
}

function SmallIcon(props: { name: 'close'; label: string; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      style={styles.smallIcon}
    >
      <Icon name={props.name} size={18} color={colors.text.icon} />
    </PressableScale>
  );
}

/** 눌러서 바로 고치는 글(키패드). 다 쓰면(완료·다른 곳 누르기) 바뀐 글을 넘긴다 */
function InlineText(props: {
  value: string;
  placeholder: string;
  maxLength: number;
  onCommit: (text: string) => void;
}) {
  const [text, setText] = useState(props.value);
  const commit = () => {
    const next = text.trim();
    if (next !== props.value.trim()) props.onCommit(next);
  };
  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onEndEditing={commit}
      onSubmitEditing={commit}
      placeholder={props.placeholder}
      placeholderTextColor={colors.text.muted}
      maxLength={props.maxLength}
      returnKeyType="done"
      accessibilityLabel={props.placeholder}
      style={[typography.bodyBold, styles.value, styles.inline]}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  center: { textAlign: 'center', color: colors.text.default },
  organize: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[20],
    paddingHorizontal: layout.screenPaddingX + spacing[4],
  },
  organizeIcon: {
    width: 96,
    height: 96,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.primaryBg,
  },
  steps: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface.subtle,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[18],
    paddingVertical: spacing[12],
    gap: spacing[10],
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[10] },
  stepDone: { color: colors.status.success },
  stepNow: { color: colors.brand.primary },
  stepWait: { color: colors.text.muted },
  organizeHint: { color: colors.text.sub, textAlign: 'center' },
  headerLink: {
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
  link: { color: colors.brand.primary },
  body: {
    paddingHorizontal: layout.screenPaddingX,
    paddingVertical: spacing[16],
    gap: spacing[20],
  },
  info: {
    borderWidth: 1,
    borderColor: colors.line.strong,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[14],
    paddingVertical: spacing[4],
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[10],
    paddingVertical: spacing[10],
  },
  infoLine: { borderBottomWidth: 1, borderBottomColor: colors.line.default },
  infoLabel: { width: 44, color: colors.text.sub, paddingTop: spacing[4] },
  infoValue: { flex: 1, alignItems: 'flex-start', gap: spacing[4] },
  editHit: { minHeight: 32, justifyContent: 'center' },
  value: { color: colors.text.default },
  inline: {
    alignSelf: 'stretch',
    paddingVertical: spacing[2],
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.line.default,
  },
  blank: { color: colors.text.muted },
  changed: {
    backgroundColor: colors.brand.primaryBg,
    borderRadius: radius.md,
    marginHorizontal: -spacing[8],
    paddingHorizontal: spacing[8],
  },
  day: { gap: spacing[14] },
  dayTitle: { color: colors.text.default },
  dayDate: { color: colors.text.sub },
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.gray[300],
    borderRadius: radius.md,
    padding: spacing[12],
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[12],
    paddingVertical: spacing[2],
  },
  dot: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.primary,
    marginTop: spacing[2],
  },
  dotEmpty: {
    backgroundColor: colors.surface.white,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.gray[300],
  },
  dotChanged: { backgroundColor: colors.brand.primaryDark },
  dotText: { color: colors.text.inverse },
  dotTextEmpty: { color: colors.text.muted },
  itemBody: { flex: 1, alignItems: 'flex-start', gap: spacing[4] },
  when: { color: colors.text.sub },
  smallIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surface.default,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
    minHeight: layout.minTouchTarget,
  },
  bar: {
    flexDirection: 'row',
    gap: spacing[8],
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[12],
    borderTopWidth: 1,
    borderTopColor: colors.line.default,
    backgroundColor: colors.surface.white,
  },
  sheetRow: { flexDirection: 'row', gap: spacing[8] },
  busy: { position: 'absolute', left: 0, right: 0, bottom: 96, alignItems: 'center' },
  busyText: {
    color: colors.text.inverse,
    backgroundColor: colors.text.default,
    borderRadius: radius.full,
    paddingHorizontal: spacing[14],
    paddingVertical: spacing[6],
    overflow: 'hidden',
  },
});
