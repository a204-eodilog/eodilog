import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useSavePlaces } from './use-bookmark-mutations';

const mockPut = jest.fn(async (..._args: unknown[]) => ({}));
const mockAddToTrip = jest.fn(async (..._args: unknown[]) => ({}));
const mockGetAll = jest.fn(async () => [] as unknown[]);

jest.mock('../api', () => ({
  putBookmark: (...args: unknown[]) => mockPut(...args),
  addToTrip: (...args: unknown[]) => mockAddToTrip(...args),
  getAllBookmarks: () => mockGetAll(),
  deleteBookmark: jest.fn(),
  updateBookmarkMemo: jest.fn(),
}));
jest.mock('@/components/ui', () => ({ toast: { show: jest.fn(), error: jest.fn() } }));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSavePlaces(), { wrapper });
}

beforeEach(() => {
  mockPut.mockClear();
  mockAddToTrip.mockClear();
  mockGetAll.mockClear();
});

describe('useSavePlaces', () => {
  it('둘 다 고르면 개인 즐겨찾기와 여행 두 곳에 모두 저장한다', async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.mutateAsync({
        placeIds: ['p1'],
        targets: [{ kind: 'personal' }, { kind: 'trip', tripId: 't1' }],
        memo: '노을 질 때',
      });
    });
    expect(mockPut).toHaveBeenCalledWith('p1', { memo: '노을 질 때' });
    expect(mockAddToTrip).toHaveBeenCalledWith('t1', 'p1', '노을 질 때');
  });

  it('나만 보기만 고르면 개인 즐겨찾기에만 저장한다', async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.mutateAsync({ placeIds: ['p1', 'p2'], targets: [{ kind: 'personal' }] });
    });
    expect(mockPut).toHaveBeenCalledTimes(2);
    expect(mockAddToTrip).not.toHaveBeenCalled();
  });

  it('동행과 같이만 고르면 여행에만 저장한다', async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.mutateAsync({
        placeIds: ['p1'],
        targets: [{ kind: 'trip', tripId: 't1' }],
      });
    });
    expect(mockAddToTrip).toHaveBeenCalledTimes(1);
    expect(mockPut).not.toHaveBeenCalled();
  });
});
