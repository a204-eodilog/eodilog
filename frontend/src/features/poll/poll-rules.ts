import { withRo, withWa } from '@/lib/korean';

import type { Poll, PollCandidate, PollType } from './types';

// 투표 화면의 순수 규칙. 시각은 모두 서울 기준(UTC+9 고정)으로 보인다

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const SEOUL_OFFSET_MS = 9 * HOUR_MS;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 마감 시각 기본값(지금부터 24시간 뒤, 결정 F-13) */
export const DEFAULT_OPEN_HOURS = 24;
/** 마감 시각은 30일 이내여야 한다(서버 PollService.MAX_OPEN_PERIOD) */
export const MAX_OPEN_DAYS = 30;
/** 한 투표의 후보 수 상한(서버 MAX_CANDIDATES) */
export const MAX_CANDIDATES = 30;
/** 투표를 연 뒤 이만큼 넘게 늦게 들어온 후보를 '새 후보'로 본다(research R8) */
const NEW_CANDIDATE_GAP_MS = MINUTE_MS;

/**
 * S22 화면 상태(data-model PollViewState).
 * closing은 서버가 아직 마감하지 않았지만 마감 시각이 지난 OPEN 투표다. 다시 받아 결과를 보인다
 */
export type PollViewState = 'none' | 'open' | 'closing' | 'decided' | 'tie' | 'noVotes';

export function pollViewState(poll: Poll | null, now: Date): PollViewState {
  if (!poll) return 'none';
  if (poll.status === 'OPEN') {
    return now.getTime() >= Date.parse(poll.closesAt) ? 'closing' : 'open';
  }
  if (poll.status === 'CLOSED') return 'noVotes';
  return poll.selectedCandidateIds.length > 1 ? 'tie' : 'decided';
}

/** 진행 중 카드의 남은 시간. 하루 이상 일, 한 시간 이상 시간, 그 밖은 분(최소 1분). 지났으면 null */
export function remainingLabel(closesAt: string, now: Date): string | null {
  const left = Date.parse(closesAt) - now.getTime();
  if (left <= 0) return null;
  if (left >= DAY_MS) return `${Math.floor(left / DAY_MS)}일 남았어요`;
  if (left >= HOUR_MS) return `${Math.floor(left / HOUR_MS)}시간 남았어요`;
  return `${Math.max(1, Math.ceil(left / MINUTE_MS))}분 남았어요`;
}

/** N8 마감 시각 기본값. 분 아래는 버린다 */
export function defaultClosesAt(now: Date): Date {
  const at = new Date(now.getTime() + DEFAULT_OPEN_HOURS * HOUR_MS);
  at.setSeconds(0, 0);
  return at;
}

export type ClosesAtError = 'past' | 'tooFar';

/** 마감 시각 검사. 지금 이후이고 30일 이내(정확히 30일은 된다) */
export function validateClosesAt(value: Date, now: Date): ClosesAtError | null {
  const diff = value.getTime() - now.getTime();
  if (diff <= 0) return 'past';
  if (diff > MAX_OPEN_DAYS * DAY_MS) return 'tooFar';
  return null;
}

export const CLOSES_AT_ERROR_TEXT: Record<ClosesAtError, string> = {
  past: '지금보다 늦은 시각을 골라 주세요',
  tooFar: '마감은 30일 안으로 정할 수 있어요',
};

/** 서울 기준 "10.28(수) 21:00" */
export function seoulDateTime(iso: string | Date): string {
  const t = typeof iso === 'string' ? Date.parse(iso) : iso.getTime();
  const d = new Date(t + SEOUL_OFFSET_MS);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()}(${WEEKDAYS[d.getUTCDay()]}) ${hh}:${mm}`;
}

/** 서울 기준 날짜만 "10.27(화)" */
export function seoulDate(iso: string): string {
  return seoulDateTime(iso).split(' ')[0];
}

/** N8 마감 카드 첫 줄: "10.28(수) 21:00 마감 · 24시간 뒤". 이틀 넘게 남으면 "N일 뒤" */
export function closesAtLabel(closesAt: Date, now: Date): string {
  const hours = Math.round((closesAt.getTime() - now.getTime()) / HOUR_MS);
  const after = hours < 48 ? `${Math.max(hours, 0)}시간 뒤` : `${Math.round(hours / 24)}일 뒤`;
  return `${seoulDateTime(closesAt)} 마감 · ${after}`;
}

/** 자동 제목. 사용자가 입력하지 않는다 (가정 — 사용자 확인 필요, Q-4-5) */
export function pollTitle(type: PollType): string {
  return type === 'REGION' ? '어디로 갈까요?' : '어디에 가 볼까요?';
}

/** 화면 머리 제목 */
export function pollTypeLabel(type: PollType | null): string {
  if (type === 'REGION') return '지역 투표';
  if (type === 'PLACE') return '장소 투표';
  return '투표';
}

/** 투표를 연 뒤에 들어온 후보인가(research R8) (가정 — 사용자 확인 필요, Q-4-2) */
export function isNewCandidate(candidate: PollCandidate, candidates: PollCandidate[]): boolean {
  if (candidates.length === 0) return false;
  const first = Math.min(...candidates.map((c) => Date.parse(c.addedAt)));
  return Date.parse(candidate.addedAt) - first > NEW_CANDIDATE_GAP_MS;
}

/** 막대 길이 비율. 투표할 수 있는 동행 수에 대한 득표 비율(0~1) */
export function voteRatio(voteCount: number, eligibleMemberCount: number): number {
  if (eligibleMemberCount <= 0) return 0;
  return Math.min(1, Math.max(0, voteCount / eligibleMemberCount));
}

/** 가장 많이 받은 후보들(1표 이상). 동률이면 여럿 */
export function topCandidateIds(candidates: PollCandidate[]): string[] {
  const max = Math.max(0, ...candidates.map((c) => c.voteCount));
  if (max === 0) return [];
  return candidates.filter((c) => c.voteCount === max).map((c) => c.id);
}

/** 아직 투표하지 않은 인원 */
export function notVotedCount(poll: Poll): number {
  return Math.max(0, poll.eligibleMemberCount - poll.votedMemberCount);
}

/** 하단 내 선택 요약. 하나면 "부산에 투표했어요", 여럿이면 "2곳 투표했어요", 없으면 null */
export function myVoteSummary(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]}에 투표했어요`;
  return `${names.length}곳 투표했어요`;
}

/** 이름 목록을 "부산과 강릉", "부산, 강릉과 여수"로 잇는다 */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  const head = names.slice(0, -1).join(', ');
  return `${withWa(head)} ${names[names.length - 1]}`;
}

/**
 * 투표 바꾸기 실패 문구(Figma 201-29384). wanted는 고르려던 이름, saved는 서버에 남은 내 선택 이름.
 * "강릉으로 바꾸지 못했어요." / "부산 투표는 그대로예요"
 */
export function ballotFailLines(wanted: string[], saved: string[]): [string, string] {
  const first =
    wanted.length === 0
      ? '투표를 취소하지 못했어요.'
      : `${withRo(wanted.length === 1 ? wanted[0] : `${wanted.length}곳`)} 바꾸지 못했어요.`;
  const second =
    saved.length === 0
      ? '아직 투표하지 않은 그대로예요'
      : `${saved.length === 1 ? saved[0] : `${saved.length}곳`} 투표는 그대로예요`;
  return [first, second];
}

/**
 * S17 '투표' 메뉴로 들어왔을 때 보일 투표(research R7).
 * 목록은 최근 생성 순이다. 진행 중인 투표 중 가장 최근 것, 없으면 가장 최근 투표, 없으면 null
 */
export function pickPoll(polls: Poll[], now: Date): Poll | null {
  const open = polls.find((p) => pollViewState(p, now) === 'open');
  return open ?? polls[0] ?? null;
}
