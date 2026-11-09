import { withIGa } from '@/lib/korean';

import type { ChecklistItem } from './types';

/** 준비물 이름 최대 길이. 서버도 앞뒤 공백을 뺀 뒤 1~255자만 받는다 */
export const LABEL_MAX = 255;

/** 챙긴 동행을 멤버 목록에서 찾지 못했을 때(나간 동행) 쓰는 이름 */
export const UNKNOWN_CHECKER = '동행';

export const CHECKLIST_TEXT = {
  conflict: '다른 동행이 먼저 바꿨어요. 최신 목록을 불러왔어요',
  gone: '이미 지워진 준비물이에요',
  saveFailed: '저장하지 못했어요. 연결을 확인해 주세요',
  addFailed: '추가하지 못했어요. 다시 시도해 주세요',
  suggestFailTitle: '준비물을 다시 제안하지 못했어요',
  suggestFailBody: '지금 목록은 그대로예요',
  disabledTitle: '준비물 추천이 꺼져 있어요',
  disabledBody: '설정에서 켜면 제안을 받을 수 있어요',
  keepEdited: '직접 고친 항목은 그대로 둬요',
  nothingNew: '새로 더할 준비물이 없어요',
} as const;

/** "6개 중 3개 챙겼어요". 모두 챙겼으면 "6개 모두 챙겼어요" */
export function progressLabel(items: readonly ChecklistItem[]): string {
  const total = items.length;
  const done = items.filter((i) => i.checked).length;
  if (total > 0 && done === total) return `${total}개 모두 챙겼어요`;
  return `${total}개 중 ${done}개 챙겼어요`;
}

/** 진행 막대 비율 0~1. 항목이 없으면 0 */
export function progressRatio(items: readonly ChecklistItem[]): number {
  if (items.length === 0) return 0;
  return items.filter((i) => i.checked).length / items.length;
}

/** 멤버 ID → 이름. 못 찾으면 '동행' */
export function checkerName(
  memberId: string | null,
  members: readonly { id: string; name: string }[],
): string | null {
  if (!memberId) return null;
  return members.find((m) => m.id === memberId)?.name ?? UNKNOWN_CHECKER;
}

/** 이름 아래 한 줄. "오전 비 70% · 세은이 챙겨요", 이유가 없으면 "세은이 챙겨요", 둘 다 없으면 null */
export function metaLine(
  item: ChecklistItem,
  members: readonly { id: string; name: string }[],
): string | null {
  const reason = item.reason?.trim() || null;
  const name = item.checked ? checkerName(item.checkedByMemberId, members) : null;
  const checker = name ? `${withIGa(name)} 챙겨요` : null;
  const parts = [reason, checker].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** 이름 옆 표시. 직접 쓴 항목 '직접 추가', AI 제안을 고친 항목 '직접 고침', 그대로인 AI 제안은 없음 */
export function sourceTag(item: ChecklistItem): string | null {
  if (item.source === 'MANUAL') return '직접 추가';
  return item.modifiedByUser ? '직접 고침' : null;
}

/** 입력 이름을 서버 규칙대로 다듬는다. 앞뒤 공백을 빼고 1~255자가 아니면 null */
export function validateLabel(raw: string): string | null {
  const label = raw.trim();
  if (label.length === 0 || label.length > LABEL_MAX) return null;
  return label;
}

/** 같은 준비물인지 비교할 때 쓰는 키. 앞뒤 공백을 빼고 안쪽 공백을 하나로, 영문은 소문자로 */
export function labelKey(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}
