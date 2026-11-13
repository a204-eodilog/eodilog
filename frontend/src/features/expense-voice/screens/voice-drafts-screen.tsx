import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { type Href, router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';

import { toApiError } from '@/api/errors';
import {
  CenterNotice,
  ConfirmSheet,
  ErrorState,
  Header,
  Icon,
  Spinner,
  toast,
} from '@/components/ui';
import {
  type ExpenseForm,
  ExpenseFormView,
  type TripMember,
  expenseKeys,
  toExpenseInput,
  useExpenseBoard,
} from '@/features/expense';
import { colors, radius, spacing, typography } from '@/theme';

import { getVoiceJob, saveExpenseBatch } from '../api';
import { VoiceDraftsView } from '../components/voice-drafts-view';
import { voiceDraftKey } from '../hooks/use-voice-analysis';
import type { VoiceDraftResult } from '../types';
import {
  type DraftItem,
  batchSignature,
  draftProblems,
  hasCountMismatch,
  saveState,
  toBatchItems,
  toDraftItems,
} from '../voice-rules';

/** 결과는 서버에 1시간 남는다 */
const RESULT_TTL_MS = 60 * 60 * 1000;

class Expired extends Error {}

/**
 * N11 말로 경비 초안 확인(`/trips/{tripId}/expenses/voice/{jobId}`).
 * 녹음 시트가 넣어 둔 결과를 쓰고, 없으면(앱을 다시 켬 등) 작업을 다시 읽는다. 없어졌으면 결과 만료.
 * 초안을 고르고 고친 뒤 한 번에 저장한다. 저장하지 않고 나가면 버릴지 묻는다.
 */
export function VoiceDraftsScreen() {
  const { tripId, jobId } = useLocalSearchParams<{ tripId: string; jobId: string }>();
  const board = useExpenseBoard(tripId);
  const result = useQuery({
    queryKey: voiceDraftKey(jobId),
    queryFn: async ({ signal }) => {
      try {
        const job = await getVoiceJob(jobId, signal);
        if (job.status === 'SUCCEEDED' && job.result) return job.result;
      } catch (e) {
        const error = toApiError(e);
        if (!(error.kind === 'http' && error.status === 404)) throw e;
      }
      throw new Expired();
    },
    staleTime: Infinity,
    gcTime: RESULT_TTL_MS,
    retry: false,
  });

  const toNew = (voice: boolean) =>
    router.replace(`/trips/${tripId}/expenses/new${voice ? '?voice=1' : ''}` as Href);

  if (result.isLoading || board.isLoading) {
    return (
      <View style={styles.screen}>
        <Header close title="말로 입력한 지출" />
        <Spinner style={styles.flex} color={colors.brand.primary} />
      </View>
    );
  }
  if (result.error instanceof Expired) {
    return (
      <View style={styles.screen}>
        <Header close title="말로 입력한 지출" subtitle={board.trip?.title} subtitleIcon="trip" />
        <CenterNotice
          icon="clock"
          title="결과가 만료됐어요"
          description="말로 입력한 결과는 1시간 동안만 남아요. 다시 녹음해 주세요"
          actionLabel="다시 녹음"
          actionIcon="mic"
          onAction={() => toNew(true)}
          secondaryLabel="직접 입력"
          onSecondary={() => toNew(false)}
        />
      </View>
    );
  }
  if (result.error || board.error || !result.data || !board.trip) {
    return (
      <View style={styles.screen}>
        <Header close title="말로 입력한 지출" />
        <ErrorState
          title="초안을 불러오지 못했어요"
          onRetry={() => {
            void result.refetch();
            board.refetch();
          }}
        />
      </View>
    );
  }

  return (
    <DraftEditor
      tripId={tripId}
      jobId={jobId}
      tripTitle={board.trip.title}
      members={board.members}
      myMemberId={board.myMemberId}
      result={result.data}
      onRerecord={() => toNew(true)}
    />
  );
}

type Exit = 'back' | 'rerecord' | 'saved';

function DraftEditor({
  tripId,
  jobId,
  tripTitle,
  members,
  myMemberId,
  result,
  onRerecord,
}: {
  tripId: string;
  jobId: string;
  tripTitle: string;
  members: TripMember[];
  myMemberId: string | null;
  result: VoiceDraftResult;
  onRerecord: () => void;
}) {
  const queryClient = useQueryClient();
  // 처음 받은 결과로 한 번만 만든다. 늦게 온 응답이 사용자가 고친 값을 덮지 않는다
  const [items, setItems] = useState<DraftItem[]>(() => toDraftItems(result));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ExpenseForm | null>(null);
  const [confirm, setConfirm] = useState<'back' | 'rerecord' | null>(null);
  const [exit, setExit] = useState<Exit | null>(null);
  /** 저장 키. 같은 목록을 다시 보내면 같은 키 */
  const saveKey = useRef<{ signature: string; key: string } | null>(null);
  /** 시각을 모르는 초안에 넣을 '지금'. 다시 저장해도 같은 값을 쓴다 */
  const savedAt = useRef<Date | null>(null);

  const active = useMemo(() => members.filter((m) => m.status === 'ACTIVE'), [members]);
  const activeIds = useMemo(() => active.map((m) => m.id), [active]);
  const state = saveState(items, activeIds);

  const save = useMutation({
    mutationFn: (body: { items: ReturnType<typeof toBatchItems>; key: string }) =>
      saveExpenseBatch(tripId, body.items, body.key),
    onSuccess: (_, body) => {
      void queryClient.invalidateQueries({ queryKey: expenseKeys.expenses(tripId) });
      void queryClient.invalidateQueries({ queryKey: expenseKeys.trip(tripId) });
      void queryClient.invalidateQueries({ queryKey: expenseKeys.settlement(tripId) });
      queryClient.removeQueries({ queryKey: voiceDraftKey(jobId) });
      toast.success(`지출 ${body.items.length}건을 저장했어요`);
      setExit('saved');
    },
  });

  usePreventRemove(exit === null && !save.isPending, () => setConfirm('back'));
  useEffect(() => {
    if (exit === 'rerecord') onRerecord();
    else if (exit) {
      if (router.canGoBack()) router.back();
      else router.replace(`/trips/${tripId}/expenses` as Href);
    }
  }, [exit, onRerecord, tripId]);

  // 초안 고치기 중에는 안드로이드 뒤로 버튼이 고치기만 닫는다
  useEffect(() => {
    if (!editingId) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setEditingId(null);
      return true;
    });
    return () => sub.remove();
  }, [editingId]);

  const doSave = () => {
    if (!state.canSave || save.isPending) return;
    savedAt.current ??= new Date();
    const body = toBatchItems(items, savedAt.current);
    const signature = batchSignature(body);
    if (saveKey.current?.signature !== signature)
      saveKey.current = { signature, key: randomUUID() };
    save.mutate({ items: body, key: saveKey.current.key });
  };

  const editing = editingId ? items.find((i) => i.draftId === editingId) : undefined;
  if (editing && editForm) {
    const valid = toExpenseInput(editForm);
    return (
      <ExpenseFormView
        mode="create"
        tripTitle={tripTitle}
        members={active}
        myMemberId={myMemberId}
        form={editForm}
        onChange={(next) => setEditForm((prev) => (prev ? { ...prev, ...next } : prev))}
        onClose={() => setEditingId(null)}
        onSave={() => {
          if (!('input' in valid)) return;
          setItems((prev) =>
            prev.map((i) =>
              i.draftId === editing.draftId
                ? { ...i, form: editForm, edited: true, selected: true }
                : i,
            ),
          );
          setEditingId(null);
        }}
        canSave={'input' in valid}
        titleOverride="초안 고치기"
        saveLabel="적용"
        notice={
          <View style={styles.quote}>
            <Icon name="mic" size={16} color={colors.text.icon} />
            <Text style={[typography.caption, styles.sub, styles.flex]}>“{editing.segment}”</Text>
          </View>
        }
      />
    );
  }

  const discardTitle = `저장하지 않은 초안 ${items.length}건과 받아 적은 글이 사라져요`;
  return (
    <>
      <VoiceDraftsView
        tripTitle={tripTitle}
        transcript={result.transcript}
        countMismatch={hasCountMismatch(result)}
        items={items}
        members={members}
        myMemberId={myMemberId}
        problemsOf={(item) => draftProblems(item, activeIds)}
        save={state}
        saving={save.isPending}
        saveFailed={save.isError}
        onToggle={(id) =>
          setItems((prev) =>
            prev.map((i) => (i.draftId === id ? { ...i, selected: !i.selected } : i)),
          )
        }
        onEdit={(id) => {
          const item = items.find((i) => i.draftId === id);
          if (!item) return;
          // 나간 사람은 새 지출에 넣을 수 없어 고칠 때 뺀다
          setEditForm({
            ...item.form,
            payerMemberId:
              item.form.payerMemberId && activeIds.includes(item.form.payerMemberId)
                ? item.form.payerMemberId
                : null,
            participantMemberIds: item.form.participantMemberIds.filter((m) =>
              activeIds.includes(m),
            ),
          });
          setEditingId(id);
        }}
        onRerecord={() => setConfirm('rerecord')}
        onSave={doSave}
        onClose={() => setConfirm('back')}
      />
      <ConfirmSheet
        visible={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const next = confirm;
          setConfirm(null);
          setExit(next);
        }}
        title="초안을 버릴까요?"
        description={discardTitle}
        confirmLabel="버리기"
        confirmIcon="trash"
        cancelLabel="계속 확인"
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  quote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    paddingHorizontal: spacing[12],
    paddingVertical: spacing[10],
    borderRadius: radius.md,
    backgroundColor: colors.surface.default,
  },
  sub: { color: colors.text.icon },
});
