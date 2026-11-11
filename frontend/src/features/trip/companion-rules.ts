import { API_ERROR, toApiError } from '@/api/errors';

import type { Trip, TripMember, UpdateTripBody } from './types';

/** 여행 정원. 방장 포함 참여 중인 사람 수(API 명세 2026-10-30 확정) */
export const TRIP_CAPACITY = 20;

export type TripRole = 'owner' | 'member';

/** 여행의 참여 중 멤버 가운데 나. 나간 직후처럼 목록에 없으면 null */
export function myMember(trip: Trip, meId: string | null | undefined): TripMember | null {
  if (!meId) return null;
  return trip.members.find((m) => m.user.id === meId) ?? null;
}

/** 내가 방장인지. 여행 응답의 ownerMemberId로 정한다. 내가 멤버가 아니면 null */
export function tripRole(trip: Trip, meId: string | null | undefined): TripRole | null {
  const me = myMember(trip, meId);
  if (!me) return null;
  return me.id === trip.ownerMemberId ? 'owner' : 'member';
}

/** 참여 중인 사람이 나뿐인지. 이때 나가면 여행이 삭제된다(결정 Q-4) */
export function isAlone(trip: Trip): boolean {
  return trip.members.length === 1;
}

/** 나를 뺀 동행, 참여 순서(joinOrder)대로. 서버가 준 배열 순서는 믿지 않는다 */
export function pickableMembers(trip: Trip, myMemberId: string): TripMember[] {
  return trip.members.filter((m) => m.id !== myMemberId).sort((a, b) => a.joinOrder - b.joinOrder);
}

/**
 * 방장이 나가면 방장이 될 사람. 나를 뺀 동행 중 가장 먼저 참여한 사람(백엔드 나가기 규칙과 같다).
 * 나갔다 다시 들어온 사람은 joinOrder를 새로 받으므로 맨 뒤로 간다
 */
export function nextOwner(trip: Trip, myMemberId: string): TripMember | null {
  return pickableMembers(trip, myMemberId)[0] ?? null;
}

export function canInvite(memberCount: number): boolean {
  return memberCount < TRIP_CAPACITY;
}

/** 함께하는 사람 줄의 표시. 방장이면서 나일 수도 있다 */
export function memberLabel(
  member: TripMember,
  trip: Trip,
  meId: string | null | undefined,
): ('방장' | '나')[] {
  const labels: ('방장' | '나')[] = [];
  if (member.id === trip.ownerMemberId) labels.push('방장');
  if (meId && member.user.id === meId) labels.push('나');
  return labels;
}

export type SettingsActionKey = 'handover' | 'kick' | 'leave' | 'delete';

export type SettingsAction = {
  key: SettingsActionKey;
  label: string;
  /** 누를 수 없을 때 */
  disabled?: boolean;
  /** 누를 수 없는 이유. 줄 아래 작게 보인다 */
  reason?: string;
  /** 빨간 글자(여행 삭제) */
  danger?: boolean;
};

/**
 * S19 아래 메뉴 줄(피그마 S19, research R7).
 * 동행은 나가기 하나만, 방장은 넘기기·내보내기·나가기·삭제. 동행 화면에는 방장 줄의 자리도 없다(FR-016).
 */
export function settingsActions(role: TripRole | null, memberCount: number): SettingsAction[] {
  if (!role) return [];
  const leave: SettingsAction = { key: 'leave', label: '여행에서 나가기' };
  if (role === 'member') return [leave];
  const alone = memberCount <= 1;
  return [
    {
      key: 'handover',
      label: '방장 넘기기',
      ...(alone ? { disabled: true, reason: '넘길 동행이 없어요' } : {}),
    },
    {
      key: 'kick',
      label: '동행 내보내기',
      ...(alone ? { disabled: true, reason: '내보낼 동행이 없어요' } : {}),
    },
    leave,
    { key: 'delete', label: '여행 삭제', danger: true },
  ];
}

/**
 * 동행 관리 요청 실패 종류(research R4).
 * conflict·notOwner는 내가 본 화면이 낡았다는 뜻이라 여행을 다시 받아 보여 주고, 자동으로 다시 보내지 않는다
 */
export type MemberActionFailure = 'conflict' | 'notOwner' | 'memberGone' | 'tripGone' | 'error';

export function memberActionFailure(error: unknown): MemberActionFailure {
  const { status, code } = toApiError(error);
  if (status === 409 && code === API_ERROR.VERSION_CONFLICT) return 'conflict';
  if (status === 403 && code === API_ERROR.FORBIDDEN) return 'notOwner';
  if (status === 404 && code === API_ERROR.MEMBER_NOT_FOUND) return 'memberGone';
  if (status === 404 && code === API_ERROR.TRIP_NOT_FOUND) return 'tripGone';
  return 'error';
}

/** 실패 종류별 안내. error는 화면마다 문구가 달라 여기서 정하지 않는다 */
export const FAILURE_MESSAGE: Record<Exclude<MemberActionFailure, 'error'>, string> = {
  conflict: '그 사이 여행이 바뀌었어요',
  notOwner: '방장만 할 수 있어요',
  memberGone: '이미 여행에 없는 동행이에요',
  tripGone: '볼 수 없는 여행이에요',
};

/** S19 수정 중인 값. 이름·기간·여행지 */
export type TripDraftValues = {
  title: string;
  range: { start: string; end: string } | null;
  regionIds: string[];
};

/**
 * PATCH 본문(research R6). base는 수정을 시작한 때의 여행이다.
 * base와 비교해 바뀐 칸만 담고 expectedVersion은 base.version이다.
 * 캐시의 최신 여행을 넘기면 다른 동행의 변경을 모르고 덮어쓰게 된다(SC-003). 바뀐 게 없으면 null
 */
export function buildTripUpdate(base: Trip, draft: TripDraftValues): UpdateTripBody | null {
  const body: UpdateTripBody = { expectedVersion: base.version };
  let changed = false;

  const title = draft.title.trim();
  if (title !== base.title) {
    body.title = title;
    changed = true;
  }

  const start = draft.range?.start ?? null;
  const end = draft.range?.end ?? null;
  if (start !== base.startDate || end !== base.endDate) {
    // 서버는 시작일·종료일이 함께 있거나 함께 비어야 받는다
    body.startDate = start;
    body.endDate = end;
    changed = true;
  }

  const sameRegions =
    draft.regionIds.length === base.destinationRegionIds.length &&
    draft.regionIds.every((id, i) => id === base.destinationRegionIds[i]);
  if (!sameRegions) {
    body.destinationRegionIds = draft.regionIds;
    changed = true;
  }

  return changed ? body : null;
}

/** S19에서 고치는 칸 */
export type TripEditField = 'title' | 'range' | 'regions';

/** 안내에 쓰는 칸 이름 */
export const TRIP_EDIT_FIELD_LABEL: Record<TripEditField, string> = {
  title: '이름',
  range: '기간',
  regions: '여행지',
};

export type ConflictMerge = {
  /** 다시 채울 입력값 */
  values: TripDraftValues;
  /** 칸마다 내 입력을 남겼는지(true) 최신 여행 값을 썼는지(false) */
  keptMine: Record<TripEditField, boolean>;
  /** 나와 다른 동행이 같은 칸을 서로 다르게 고쳐 최신 값으로 바꾼 칸 */
  overlapped: TripEditField[];
  /** 최신 여행과 비교해 아직 저장할 내 변경이 남았는가 */
  leftToSave: boolean;
};

function fieldValues(trip: Trip): TripDraftValues {
  return {
    title: trip.title,
    range: trip.startDate && trip.endDate ? { start: trip.startDate, end: trip.endDate } : null,
    regionIds: trip.destinationRegionIds,
  };
}

function sameField(field: TripEditField, a: TripDraftValues, b: TripDraftValues): boolean {
  if (field === 'title') return a.title.trim() === b.title.trim();
  if (field === 'range') return a.range?.start === b.range?.start && a.range?.end === b.range?.end;
  return (
    a.regionIds.length === b.regionIds.length && a.regionIds.every((id, i) => id === b.regionIds[i])
  );
}

/**
 * 저장이 409(다른 동행이 먼저 고침)를 받은 뒤 입력값을 칸마다 다시 정한다.
 * base는 수정을 시작한 때의 여행, mine은 내 입력, latest는 다시 받은 최신 여행이다.
 * - 내가 안 고친 칸은 최신 값을 쓴다
 * - 다른 동행이 안 고친 칸은 내 입력을 남긴다(다시 입력하지 않게)
 * - 둘 다 고쳤는데 값이 같으면 최신 값과 같으므로 그대로다
 * - 둘 다 서로 다르게 고쳤으면 최신 값을 보여 주고 겹친 칸으로 알린다. 내 값으로 덮으면 그 변경이 사라지므로
 *   사용자가 보고 다시 고르게 한다
 * 자동으로 다시 보내지 않는다(research R4). leftToSave면 사용자가 [완료]를 다시 누른다
 */
export function mergeAfterConflict(base: Trip, mine: TripDraftValues, latest: Trip): ConflictMerge {
  const before = fieldValues(base);
  const theirs = fieldValues(latest);
  const keptMine: Record<TripEditField, boolean> = { title: false, range: false, regions: false };
  const overlapped: TripEditField[] = [];

  for (const field of ['title', 'range', 'regions'] as const) {
    if (sameField(field, mine, before)) continue;
    if (sameField(field, theirs, before)) keptMine[field] = true;
    else if (!sameField(field, mine, theirs)) overlapped.push(field);
  }

  const values: TripDraftValues = {
    title: keptMine.title ? mine.title : theirs.title,
    range: keptMine.range ? mine.range : theirs.range,
    regionIds: keptMine.regions ? mine.regionIds : theirs.regionIds,
  };
  return { values, keptMine, overlapped, leftToSave: buildTripUpdate(latest, values) !== null };
}
