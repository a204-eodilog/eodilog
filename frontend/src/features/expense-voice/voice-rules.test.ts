import { describe, expect, it } from '@jest/globals';

import type { VoiceDraftResult } from './types';
import {
  batchSignature,
  draftProblems,
  failureFromJobCode,
  failureFromSubmit,
  hasCountMismatch,
  saveState,
  toBatchItems,
  toDraftItems,
} from './voice-rules';

const ME = 'm-me';
const A = 'm-a';
const B = 'm-b';
const ACTIVE = [ME, A, B];

function result(over: Partial<VoiceDraftResult> = {}): VoiceDraftResult {
  return {
    transcript: '택시비 2만 4천 원 내가 냈고 셋이 나눠. 커피 만 2천 원은 민지가 냈어.',
    drafts: [
      {
        draftId: 'd1',
        transcriptSegment: '택시비 2만 4천 원 내가 냈고 셋이 나눠',
        draft: {
          title: '택시비',
          memo: null,
          amountMinor: 24000,
          currency: 'KRW',
          payerMemberId: ME,
          participantMemberIds: [ME, A, B],
          spentAt: null,
        },
        unresolvedFields: ['spentAt'],
        warnings: [],
      },
      {
        draftId: 'd2',
        transcriptSegment: '커피는 민지가 냈어',
        draft: {
          title: '커피',
          memo: null,
          amountMinor: null,
          currency: 'KRW',
          payerMemberId: A,
          participantMemberIds: [],
          spentAt: '2026-11-12T03:00:00Z',
        },
        unresolvedFields: ['amountMinor', 'participantMemberIds'],
        warnings: [
          { code: 'AMOUNT_MISSING', field: 'amountMinor', message: '금액을 확인해 주세요.' },
        ],
      },
    ],
    warnings: [],
    ...over,
  };
}

describe('초안 만들기', () => {
  it('금액은 천 단위 쉼표, 없는 금액은 빈 칸, 모두 선택한 채 시작한다', () => {
    const items = toDraftItems(result());
    expect(items.map((i) => i.form.amount)).toEqual(['24,000', '']);
    expect(items.every((i) => i.selected)).toBe(true);
  });
});

describe('확인이 필요한 칸', () => {
  it('정상 초안은 고칠 것이 없다', () => {
    const [taxi] = toDraftItems(result());
    expect(draftProblems(taxi, ACTIVE)).toEqual([]);
  });

  it('서버 경고 문장을 쓰고, 같은 칸의 빈 칸 검사는 겹쳐 보이지 않는다', () => {
    const [, coffee] = toDraftItems(result());
    expect(draftProblems(coffee, ACTIVE)).toEqual([
      { field: 'amountMinor', message: '금액을 확인해 주세요.' },
      { field: 'participantMemberIds', message: '나눌 사람을 골라 주세요' },
    ]);
  });

  it('고친 뒤에는 서버 경고 없이 지금 값만 본다', () => {
    const [, coffee] = toDraftItems(result());
    const fixed = {
      ...coffee,
      edited: true,
      form: { ...coffee.form, amount: '12,000', participantMemberIds: [ME, A] },
    };
    expect(draftProblems(fixed, ACTIVE)).toEqual([]);
  });

  it('나간 동행이 들어 있으면 다시 고르게 한다', () => {
    const [taxi] = toDraftItems(result());
    expect(draftProblems(taxi, [ME, A]).map((p) => p.field)).toEqual(['participantMemberIds']);
  });

  it('시각을 모른다는 경고는 저장을 막지 않는다', () => {
    const r = result();
    r.drafts[0].warnings = [{ code: 'SPENT_AT_UNKNOWN', field: 'spentAt', message: '시각' }];
    expect(draftProblems(toDraftItems(r)[0], ACTIVE)).toEqual([]);
  });
});

describe('저장 버튼', () => {
  it('고른 초안 중 하나라도 고칠 것이 있으면 막는다', () => {
    expect(saveState(toDraftItems(result()), ACTIVE)).toEqual({
      count: 2,
      blocked: 1,
      canSave: false,
    });
  });

  it('고칠 것이 있는 초안을 빼면 저장할 수 있다', () => {
    const items = toDraftItems(result()).map((i) =>
      i.draftId === 'd2' ? { ...i, selected: false } : i,
    );
    expect(saveState(items, ACTIVE)).toEqual({ count: 1, blocked: 0, canSave: true });
  });

  it('하나도 고르지 않으면 저장할 수 없다', () => {
    const items = toDraftItems(result()).map((i) => ({ ...i, selected: false }));
    expect(saveState(items, ACTIVE).canSave).toBe(false);
  });
});

describe('일괄 저장 본문', () => {
  it('고른 것만, 알아들은 시각은 그대로, 모르면 저장하는 지금', () => {
    const now = new Date('2026-11-12T09:00:00Z');
    const items = toDraftItems(result()).map((i) =>
      i.draftId === 'd2'
        ? { ...i, form: { ...i.form, amount: '12,000', participantMemberIds: [ME, A] } }
        : i,
    );
    const body = toBatchItems(items, now);
    expect(body).toEqual([
      expect.objectContaining({
        title: '택시비',
        amountMinor: 24000,
        spentAt: now.toISOString(),
        currency: 'KRW',
      }),
      expect.objectContaining({
        title: '커피',
        amountMinor: 12000,
        spentAt: '2026-11-12T03:00:00Z',
      }),
    ]);
    expect(batchSignature(body)).toBe(batchSignature(toBatchItems(items, now)));
  });
});

describe('실패 안내', () => {
  it('작업 오류 코드를 화면 안내로 바꾼다', () => {
    expect(failureFromJobCode('VOICE_NO_SPEECH_OR_EXPENSE')).toBe('noExpense');
    expect(failureFromJobCode('VOICE_EXPENSE_UNSUPPORTED')).toBe('unsupported');
    expect(failureFromJobCode('SOMETHING_NEW')).toBe('provider');
  });

  it('서버에 닿지 못하면 보내기 실패, 나간 여행이면 쓸 수 없음', () => {
    expect(failureFromSubmit({ kind: 'network', status: null, code: null })).toBe('upload');
    expect(failureFromSubmit({ kind: 'http', status: 404, code: 'TRIP_NOT_FOUND' })).toBe(
      'forbidden',
    );
    expect(failureFromSubmit({ kind: 'http', status: 422, code: 'INPUT_LIMIT_EXCEEDED' })).toBe(
      'limit',
    );
  });

  it('건수 다름 경고를 찾는다', () => {
    expect(hasCountMismatch(result())).toBe(false);
    expect(
      hasCountMismatch(
        result({ warnings: [{ code: 'COUNT_MISMATCH', field: null, message: '' }] }),
      ),
    ).toBe(true);
  });
});
