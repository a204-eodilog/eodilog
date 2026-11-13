/**
 * 말로 경비 입력 계약(docs/plan/voice-expense-stt-work-split-2026-11-12.md §6).
 * 음성 접수 → GET /jobs/{jobId}의 result가 VoiceDraftResult → 사용자가 고친 뒤 일괄 저장.
 */

export type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export type JobRef = { jobId: string; status: JobStatus; statusUrl: string };

export type VoiceJob = {
  id: string;
  kind: string;
  status: JobStatus;
  progress: number;
  result: VoiceDraftResult | null;
  error: { code: string; message: string } | null;
  createdAt: string;
  finishedAt: string | null;
};

/** 경고. 초안 하나 또는 전체에 붙는다. message는 서버가 사람이 읽을 문장으로 준다 */
export type VoiceWarning = { code: string; field: string | null; message: string };

/** 서버가 만든 초안 하나. 말하지 않은 값은 null·빈 배열로 온다 */
export type VoiceDraft = {
  draftId: string;
  /** 이 초안이 나온 말 한 줄 */
  transcriptSegment: string;
  draft: {
    title: string | null;
    memo: string | null;
    amountMinor: number | null;
    currency: 'KRW';
    payerMemberId: string | null;
    participantMemberIds: string[];
    /** 날짜·시각을 알아들었을 때만 UTC ISO. 없으면 저장할 때 지금 시각을 쓴다 */
    spentAt: string | null;
  };
  unresolvedFields: string[];
  warnings: VoiceWarning[];
};

export type VoiceDraftResult = {
  transcript: string;
  drafts: VoiceDraft[];
  warnings: VoiceWarning[];
};

/** POST /trips/{tripId}/expenses/batch의 한 건(기존 단건 지출과 같은 필드) */
export type ExpenseWrite = {
  title: string;
  memo: string | null;
  amountMinor: number;
  currency: 'KRW';
  payerMemberId: string;
  participantMemberIds: string[];
  spentAt: string;
};
