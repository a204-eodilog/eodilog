import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { getChecklist, updateChecklistItem } from '../api';
import { checklistItem } from '../testing';
import type { ChecklistItem } from '../types';

import { checklistKey } from './checklist-keys';
import { useChecklist } from './use-checklist';
import { useToggleCheck } from './use-toggle-check';

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
jest.mock('../api', () => ({ getChecklist: jest.fn(), updateChecklistItem: jest.fn() }));
jest.mock('@/components/ui', () => ({ toast: { show: jest.fn(), error: jest.fn() } }));

const mockGet = jest.mocked(getChecklist);
const mockUpdate = jest.mocked(updateChecklistItem);

const conflict = () =>
  Object.assign(new Error('409'), {
    isAxiosError: true,
    response: { status: 409, data: { error: { code: 'VERSION_CONFLICT', message: '' } } },
  });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('체크 충돌 뒤 다른 항목 체크', () => {
  it('충돌 항목은 곧바로 저장된 모습으로 돌아가고, 다시 받기를 다음 체크가 멈추지 않는다', async () => {
    const a = checklistItem({ id: 'a', label: '우산' });
    const b = checklistItem({ id: 'b', label: '충전기' });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
    });
    client.setQueryData(checklistKey('trip-1'), [a, b]);

    // 다른 동행이 먼저 우산을 챙겼다
    const theirs: ChecklistItem = {
      ...a,
      checked: true,
      checkedByMemberId: 'm-other',
      checkedAt: '2026-11-10T01:00:00Z',
      version: 2,
    };
    let releaseList: (items: ChecklistItem[]) => void = () => undefined;
    mockGet.mockImplementation(
      () =>
        new Promise((r) => {
          releaseList = r;
        }),
    );
    mockUpdate.mockImplementation(async (_tripId, id, body) => {
      if (id === 'a') throw conflict();
      return { ...b, checked: body.checked ?? false, version: 2 };
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = await renderHook(
      () => ({ list: useChecklist('trip-1'), toggle: useToggleCheck('trip-1', 'm-me') }),
      { wrapper },
    );

    await act(async () => {
      result.current.toggle(a);
    });
    // 내가 누른 체크가 아니라 마지막으로 저장된 해제 상태로 돌아간다
    const afterConflict = client.getQueryData<ChecklistItem[]>(checklistKey('trip-1'));
    expect(afterConflict?.find((i) => i.id === 'a')?.checked).toBe(false);
    const fetches = mockGet.mock.calls.length;
    expect(fetches).toBeGreaterThan(0);

    // 다시 받는 중에 다른 항목을 체크해도 그 받기가 멈추지 않는다
    await act(async () => {
      result.current.toggle(b);
    });
    expect(mockGet).toHaveBeenCalledTimes(fetches);
    await act(async () => {
      releaseList([theirs, b]);
    });
    await waitFor(() =>
      expect(
        client.getQueryData<ChecklistItem[]>(checklistKey('trip-1'))?.find((i) => i.id === 'a'),
      ).toMatchObject({ checked: true, checkedByMemberId: 'm-other', version: 2 }),
    );
    await waitFor(() =>
      expect(
        client.getQueryData<ChecklistItem[]>(checklistKey('trip-1'))?.find((i) => i.id === 'b'),
      ).toMatchObject({ checked: true, version: 2 }),
    );
  });
});
