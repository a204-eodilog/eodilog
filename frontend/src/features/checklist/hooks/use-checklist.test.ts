import { describe, expect, it, jest } from '@jest/globals';
import { QueryClient } from '@tanstack/react-query';

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));

import type { ChecklistItem } from '../types';

import { checklistKey } from './checklist-keys';
import { appendCachedItem, putCachedItem, removeCachedItem } from './use-checklist';

const item = (id: string, checked: boolean) =>
  ({ id, label: id, checked, checkedByMemberId: null, checkedAt: null }) as ChecklistItem;

/** 여행 중(S25)이 따로 받아 둔 "N/M 챙김" 요약 */
function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  qc.setQueryData(checklistKey('trip-1'), [item('a', true), item('b', false)]);
  qc.setQueryData([...checklistKey('trip-1'), 'summary'], { total: 2, checked: 1 });
  return qc;
}

const summaryStale = (qc: QueryClient) =>
  qc.getQueryState([...checklistKey('trip-1'), 'summary'])?.isInvalidated;
const listStale = (qc: QueryClient) => qc.getQueryState(checklistKey('trip-1'))?.isInvalidated;

describe('준비물 캐시를 바꾸면 여행 중 요약을 다시 받게 한다', () => {
  it('체크(항목 바꾸기)', () => {
    const qc = setup();
    putCachedItem(qc, 'trip-1', item('b', true));
    expect(summaryStale(qc)).toBe(true);
    // 낙관적으로 바꾼 목록은 다시 받지 않는다(서버 값이 덮지 않게)
    expect(listStale(qc)).toBe(false);
  });

  it('추가와 삭제', () => {
    const qc = setup();
    appendCachedItem(qc, 'trip-1', item('c', false));
    expect(summaryStale(qc)).toBe(true);

    const qc2 = setup();
    removeCachedItem(qc2, 'trip-1', 'a');
    expect(summaryStale(qc2)).toBe(true);
  });
});
