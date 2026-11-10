import { describe, expect, it, jest } from '@jest/globals';

import { adoptSuggestions, pickSuggestions, type SuggestionPick } from './suggestion-merge';
import { checklistItem, httpError, networkError, suggestion } from './testing';
import type { ChecklistItem } from './types';

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));

describe('더할 제안 고르기', () => {
  it('지금 목록에 있는 이름은 빼고 결과 순번은 그대로 둔다', () => {
    const current = [checklistItem({ label: '우산' }), checklistItem({ label: 'USB 케이블' })];
    const picks = pickSuggestions(current, [
      suggestion('우산'),
      suggestion('선크림'),
      suggestion(' usb  케이블 '),
      suggestion('물티슈'),
    ]);
    expect(picks).toEqual([
      { label: '선크림', index: 1 },
      { label: '물티슈', index: 3 },
    ]);
  });

  it('결과 안에서 같은 이름이 두 번 나오면 처음 것만 고른다', () => {
    const picks = pickSuggestions([], [suggestion('선크림'), suggestion('선크림 ')]);
    expect(picks).toEqual([{ label: '선크림', index: 0 }]);
  });

  it('비었거나 너무 긴 이름은 고르지 않는다', () => {
    const picks = pickSuggestions([], [suggestion('  '), suggestion('가'.repeat(256))]);
    expect(picks).toEqual([]);
  });

  it('직접 고친 항목과 체크는 건드리지 않는다', () => {
    const edited = checklistItem({
      label: '멀미약 2개',
      source: 'AI',
      modifiedByUser: true,
      checked: true,
      checkedByMemberId: 'm-seeun',
    });
    const before = { ...edited };
    pickSuggestions([edited], [suggestion('멀미약'), suggestion('멀미약 2개')]);
    expect(edited).toEqual(before);
  });
});

describe('제안 채택', () => {
  const picks: SuggestionPick[] = [
    { label: '선크림', index: 0 },
    { label: '물티슈', index: 1 },
    { label: '상비약', index: 2 },
  ];
  const made = (label: string) => checklistItem({ label, source: 'AI' });

  it('차례로 채택하고 이미 채택된 것과 400은 건너뛴다', async () => {
    const adopt = jest.fn(async (p: SuggestionPick): Promise<ChecklistItem> => {
      if (p.index === 0) throw httpError(409, 'SUGGESTION_ALREADY_ADOPTED');
      if (p.index === 1) throw httpError(400, 'VALIDATION_ERROR');
      return made(p.label);
    });
    const outcome = await adoptSuggestions(picks, adopt);
    expect(adopt.mock.calls.map(([p]) => p.index)).toEqual([0, 1, 2]);
    expect(outcome.added.map((i) => i.label)).toEqual(['상비약']);
    expect(outcome.skipped).toBe(2);
    expect(outcome.disabled).toBe(false);
  });

  it('추천 설정이 꺼지면 멈춘다', async () => {
    const adopt = jest.fn(async (p: SuggestionPick): Promise<ChecklistItem> => {
      if (p.index === 1) throw httpError(409, 'AI_FEATURE_DISABLED');
      return made(p.label);
    });
    const outcome = await adoptSuggestions(picks, adopt);
    expect(adopt).toHaveBeenCalledTimes(2);
    expect(outcome.added).toHaveLength(1);
    expect(outcome.disabled).toBe(true);
  });

  it('연결 오류면 멈추고 그때까지 더한 것을 돌려준다', async () => {
    const adopt = jest.fn(async (p: SuggestionPick): Promise<ChecklistItem> => {
      if (p.index === 2) throw networkError();
      return made(p.label);
    });
    const outcome = await adoptSuggestions(picks, adopt);
    expect(outcome.added.map((i) => i.label)).toEqual(['선크림', '물티슈']);
    expect(outcome.failed).toBe(true);
  });
});
