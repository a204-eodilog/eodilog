import { API_ERROR, toApiError } from '@/api/errors';

import { labelKey, validateLabel } from './checklist-rules';
import type { ChecklistItem, ChecklistSuggestion } from './types';

/** 채택할 제안 하나. index는 작업 결과 items 안 순번(suggestionIndex) */
export type SuggestionPick = { label: string; index: number };

/**
 * 제안 결과에서 목록에 더할 것을 고른다(가정 Q-5-1: 고르는 단계 없이 모두 더한다).
 * 지금 목록에 같은 이름이 있거나 결과 안에서 이미 고른 이름이면 뺀다. 순번은 결과 그대로 둔다.
 * 기존 항목은 읽기만 하므로 직접 고친 항목과 체크는 바뀌지 않는다. 지운 이름은 서버가 제안하지 않는다.
 */
export function pickSuggestions(
  current: readonly ChecklistItem[],
  suggestions: readonly ChecklistSuggestion[],
): SuggestionPick[] {
  const taken = new Set(current.map((i) => labelKey(i.label)));
  const picks: SuggestionPick[] = [];
  suggestions.forEach((s, index) => {
    const label = validateLabel(s.label);
    if (!label) return;
    const key = labelKey(label);
    if (taken.has(key)) return;
    taken.add(key);
    picks.push({ label, index });
  });
  return picks;
}

export type AdoptOutcome = {
  added: ChecklistItem[];
  /** 다른 동행이 먼저 채택했거나(409) 서버가 받지 않은(400) 제안 수 */
  skipped: number;
  /** 추천 설정이 꺼져 멈췄다 */
  disabled: boolean;
  /** 연결 오류 등으로 멈췄다. 그때까지 더한 것은 added에 있다 */
  failed: boolean;
};

/**
 * 고른 제안을 차례로 채택한다. 하나씩 보내 서버 순서가 결과 순서와 같게 한다.
 * 409 SUGGESTION_ALREADY_ADOPTED와 400은 건너뛰고, 409 AI_FEATURE_DISABLED와 그 밖의 오류는 멈춘다.
 */
export async function adoptSuggestions(
  picks: readonly SuggestionPick[],
  adopt: (pick: SuggestionPick) => Promise<ChecklistItem>,
): Promise<AdoptOutcome> {
  const outcome: AdoptOutcome = { added: [], skipped: 0, disabled: false, failed: false };
  for (const pick of picks) {
    try {
      outcome.added.push(await adopt(pick));
    } catch (e) {
      const { code, status } = toApiError(e);
      if (code === API_ERROR.SUGGESTION_ALREADY_ADOPTED || status === 400) {
        outcome.skipped += 1;
        continue;
      }
      if (code === API_ERROR.AI_FEATURE_DISABLED) outcome.disabled = true;
      else outcome.failed = true;
      break;
    }
  }
  return outcome;
}
