import type { ExpenseForm } from '@/features/expense';
import { exceedsAmountMax, formatThousands, parseAmount } from '@/lib/format-number';

import type { ExpenseWrite, VoiceDraftResult, VoiceWarning } from './types';

/** 한 번에 저장할 수 있는 최대 건수(서버 batch 상한) */
export const VOICE_MAX_DRAFTS = 10;
/**
 * 항목 이름 최대 길이. 경비 규칙(expense-rules TITLE_MAX_LENGTH, 서버 1~200자)과 같다.
 * 경비 기능 묶음을 값으로 불러오면 화면 부품까지 올라와 규칙만 따로 시험할 수 없어 여기 둔다
 */
const TITLE_MAX_LENGTH = 200;

// ───────────────────────── 녹음·분석 실패 ─────────────────────────

/**
 * 녹음 시트의 실패 종류. 서버 작업 오류 코드(문서 §7 표)와 접수 전 오류를 화면 안내로 묶는다.
 * upload: 서버가 받기 전에 끊김 / forbidden: 이 여행에서 쓸 수 없음(나감·삭제)
 */
export type VoiceFailure =
  | 'upload'
  | 'invalid'
  | 'limit'
  | 'noExpense'
  | 'unsupported'
  | 'provider'
  | 'timeout'
  | 'interrupted'
  | 'forbidden';

export type VoiceFailureAction = 'manual' | 'rerecord' | 'resend';

export const VOICE_FAILURE_TEXT: Record<
  VoiceFailure,
  { title: string; description: string; tone: 'danger' | 'warning'; actions: VoiceFailureAction[] }
> = {
  upload: {
    title: '녹음을 보내지 못했어요',
    description: '인터넷 연결을 확인하고 다시 보내 주세요',
    tone: 'danger',
    actions: ['rerecord', 'resend'],
  },
  invalid: {
    title: '녹음 파일을 읽지 못했어요',
    description: '한 번 더 녹음해 주세요',
    tone: 'danger',
    actions: ['manual', 'rerecord'],
  },
  limit: {
    title: '한 번에 10건까지 돼요',
    description: '지출을 나눠서 두 번에 말해 주세요',
    tone: 'warning',
    actions: ['manual', 'rerecord'],
  },
  noExpense: {
    title: '지출을 찾지 못했어요',
    description: '금액과 사람을 또박또박 다시 말하거나 직접 입력해 주세요',
    tone: 'danger',
    actions: ['manual', 'rerecord'],
  },
  unsupported: {
    title: '원화·똑같이 나누기만 돼요',
    description: '외화나 비율로 나누는 지출은 직접 입력해 주세요',
    tone: 'warning',
    actions: ['manual'],
  },
  provider: {
    title: '지금은 정리할 수 없어요',
    description: '잠시 뒤 다시 보내 주세요. 녹음은 이 화면에 있는 동안만 남아요',
    tone: 'danger',
    actions: ['rerecord', 'resend'],
  },
  timeout: {
    title: '정리가 오래 걸려 멈췄어요',
    description: '다시 보내거나 짧게 나눠서 말해 주세요',
    tone: 'danger',
    actions: ['rerecord', 'resend'],
  },
  interrupted: {
    title: '정리가 중단됐어요',
    description: '한 번 더 녹음해 주세요',
    tone: 'danger',
    actions: ['manual', 'rerecord'],
  },
  forbidden: {
    title: '이 여행에서 쓸 수 없어요',
    description: '여행에서 나갔거나 여행이 지워졌을 수 있어요',
    tone: 'danger',
    actions: ['manual'],
  },
};

/** 작업 오류 코드 → 실패 종류(문서 §7 jobs.error.code) */
export function failureFromJobCode(code: string | null | undefined): VoiceFailure {
  switch (code) {
    case 'VOICE_AUDIO_INVALID':
      return 'invalid';
    case 'VOICE_INPUT_LIMIT_EXCEEDED':
      return 'limit';
    case 'VOICE_NO_SPEECH_OR_EXPENSE':
      return 'noExpense';
    case 'VOICE_EXPENSE_UNSUPPORTED':
      return 'unsupported';
    case 'VOICE_PROCESSING_TIMEOUT':
      return 'timeout';
    case 'VOICE_PROCESSING_INTERRUPTED':
      return 'interrupted';
    default:
      return 'provider';
  }
}

/** 접수(POST) 단계의 HTTP 오류 → 실패 종류. 서버에 닿지 못했으면 upload */
export function failureFromSubmit(error: {
  kind: 'http' | 'network' | 'timeout';
  status: number | null;
  code: string | null;
}): VoiceFailure {
  if (error.kind !== 'http') return 'upload';
  if (error.status === 403 || error.status === 404) return 'forbidden';
  if (error.code === 'INPUT_LIMIT_EXCEEDED' || error.status === 413) return 'limit';
  if (error.status === 400 || error.status === 415 || error.status === 422) return 'invalid';
  return 'provider';
}

// ───────────────────────── 초안 확인 ─────────────────────────

/** 화면에서 고치는 초안 하나 */
export type DraftItem = {
  draftId: string;
  segment: string;
  form: ExpenseForm;
  /** 서버가 알아들은 시각. 없으면 저장할 때 지금 시각 */
  spentAt: string | null;
  /** AI가 준 메모. 고치는 칸은 없고 그대로 저장한다 */
  memo: string | null;
  /** 서버가 확인이 필요하다고 표시한 칸(unresolvedFields). spentAt은 지금 시각으로 저장해 빼고 담는다 */
  unresolved: string[];
  selected: boolean;
  /** 서버 경고. 사용자가 이 초안을 한 번 고치면 더 보이지 않는다(고친 값 기준으로만 검사) */
  serverWarnings: VoiceWarning[];
  edited: boolean;
};

export function toDraftItems(result: VoiceDraftResult): DraftItem[] {
  return result.drafts.slice(0, VOICE_MAX_DRAFTS).map((d) => ({
    draftId: d.draftId,
    segment: d.transcriptSegment,
    form: {
      amount: d.draft.amountMinor ? formatThousands(d.draft.amountMinor) : '',
      title: d.draft.title ?? '',
      payerMemberId: d.draft.payerMemberId,
      participantMemberIds: d.draft.participantMemberIds,
    },
    spentAt: d.draft.spentAt,
    memo: d.draft.memo,
    unresolved: d.unresolvedFields.filter((field) => field !== 'spentAt'),
    selected: true,
    serverWarnings: d.warnings,
    edited: false,
  }));
}

/** 확인이 필요한 칸 하나. 카드 아래 빨간 표시 */
export type DraftProblem = { field: string; message: string };

/**
 * 초안에서 저장 전에 고쳐야 할 것. 서버 경고(이름을 못 맞춤 등)와 빈 칸 검사를 합친다.
 * 같은 칸에 서버 경고가 있으면 그 문장(예: "‘민수’는 이 여행 동행에 없어요")을 쓴다.
 * activeMemberIds: 지금 여행에 있는 동행. 나간 사람은 새 지출에 넣을 수 없다
 */
export function draftProblems(item: DraftItem, activeMemberIds: readonly string[]): DraftProblem[] {
  const active = new Set(activeMemberIds);
  const f = item.form;
  const local: DraftProblem[] = [];
  if (exceedsAmountMax(f.amount)) local.push({ field: 'amountMinor', message: '금액이 너무 커요' });
  else if (!parseAmount(f.amount))
    local.push({ field: 'amountMinor', message: '금액을 넣어 주세요' });
  const title = f.title.trim();
  if (!title || title.length > TITLE_MAX_LENGTH)
    local.push({ field: 'title', message: '항목 이름을 넣어 주세요' });
  if (!f.payerMemberId || !active.has(f.payerMemberId))
    local.push({ field: 'payerMemberId', message: '낸 사람을 골라 주세요' });
  if (f.participantMemberIds.length === 0 || f.participantMemberIds.some((id) => !active.has(id)))
    local.push({ field: 'participantMemberIds', message: '나눌 사람을 골라 주세요' });

  if (item.edited) return local;
  // 서버 경고는 아직 고치지 않은 칸에만. 시각을 모른다는 경고는 지금 시각으로 저장하므로 막지 않는다
  const fromServer = item.serverWarnings.filter(
    (w) => w.code !== 'SPENT_AT_UNKNOWN' && w.field !== 'spentAt' && w.code !== 'COUNT_MISMATCH',
  );
  // 실제 서버는 한 칸에 경고를 여러 개(MEMBER_NOT_FOUND·PARTICIPANTS_UNKNOWN 등) 붙이고 문장도 모두 같다
  // (2026-11-13 로컬 연동 확인). 칸마다 한 번만, 칸에 맞는 문장으로 보인다
  const covered = new Set(fromServer.map((w) => w.field ?? ''));
  const problems: DraftProblem[] = [
    ...[...covered].map((field) => ({
      field,
      message: UNRESOLVED_TEXT[field] ?? fromServer.find((w) => (w.field ?? '') === field)!.message,
    })),
    ...local.filter((p) => !covered.has(p.field)),
  ];
  // 서버가 값을 채웠어도 unresolvedFields에 남긴 칸은 확인이 필요하다. 경고·빈 칸 검사로 이미 잡은 칸은 겹치지 않게 뺀다
  const shown = new Set(problems.map((p) => p.field));
  for (const field of item.unresolved) {
    if (!shown.has(field))
      problems.push({ field, message: UNRESOLVED_TEXT[field] ?? '이 값을 확인해 주세요' });
  }
  return problems;
}

/** unresolvedFields 칸별 안내. 계약 필드 이름 기준 */
const UNRESOLVED_TEXT: Record<string, string> = {
  amountMinor: '금액을 확인해 주세요',
  title: '항목 이름을 확인해 주세요',
  payerMemberId: '낸 사람을 확인해 주세요',
  participantMemberIds: '나눌 사람을 확인해 주세요',
};

/** 말한 지출과 초안 수가 다를 수 있다는 전체 경고 */
export function hasCountMismatch(result: VoiceDraftResult): boolean {
  return result.warnings.some((w) => w.code === 'COUNT_MISMATCH');
}

/** 저장 버튼. 고른 것이 1건 이상이고 고른 것 모두에 고칠 것이 없어야 한다 */
export function saveState(items: DraftItem[], activeMemberIds: readonly string[]) {
  const chosen = items.filter((i) => i.selected);
  const blocked = chosen.filter((i) => draftProblems(i, activeMemberIds).length > 0).length;
  return {
    count: chosen.length,
    blocked,
    canSave: chosen.length > 0 && chosen.length <= VOICE_MAX_DRAFTS && blocked === 0,
  };
}

/** 고른 초안을 일괄 저장 본문으로. 시각을 모르면 저장하는 지금(직접 입력과 같다) */
export function toBatchItems(items: DraftItem[], now: Date): ExpenseWrite[] {
  return items
    .filter((i) => i.selected)
    .map((i) => ({
      title: i.form.title.trim(),
      memo: i.memo,
      amountMinor: parseAmount(i.form.amount) ?? 0,
      currency: 'KRW',
      payerMemberId: i.form.payerMemberId ?? '',
      participantMemberIds: i.form.participantMemberIds,
      spentAt: i.spentAt ?? now.toISOString(),
    }));
}

/** 같은 내용을 다시 보내면 같은 저장 키를 쓰려고 본문을 글자로 바꾼다 */
export function batchSignature(items: ExpenseWrite[]): string {
  return JSON.stringify(items.map((i) => ({ ...i, spentAt: i.spentAt.slice(0, 16) })));
}
