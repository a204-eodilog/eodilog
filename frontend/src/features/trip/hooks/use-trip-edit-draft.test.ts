import { beforeEach, describe, expect, it } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { buildTripUpdate } from '../companion-rules';
import type { Region, Trip } from '../types';

import { useSyncEditDraft, useTripEditDraft } from './use-trip-edit-draft';

/**
 * 여행 설정(S19)을 연 동안 동행이 들어오거나 나가면 서버는 여행 버전만 올린다(2026-11-09).
 * 그때 기준을 옮기지 않으면 이름·기간을 아무도 안 고쳤는데도 [완료]가 409를 받고, 입력이 최신 값으로 덮인다
 */

const JEJU: Region = { id: 'r-1', name: '제주특별자치도' } as Region;

function trip(version: number, over: Partial<Trip> = {}): Trip {
  return {
    id: 'trip-1',
    title: '겨울 바다',
    startDate: null,
    endDate: null,
    destinationRegionIds: ['r-1'],
    version,
    members: [],
    ...over,
  } as unknown as Trip;
}

/** 지금 입력값으로 [완료]를 누르면 보낼 본문 */
function saveBody() {
  const s = useTripEditDraft.getState();
  return buildTripUpdate(s.base!, {
    title: s.title,
    range: s.range,
    regionIds: s.regions.map((r) => r.id),
  });
}

beforeEach(() => {
  useTripEditDraft.getState().reset();
});

describe('여행 설정 입력값과 여행 맞추기', () => {
  it('열 때 받은 여행이 낡았어도, 버전만 오른 최신 여행을 받으면 최신 버전으로 저장한다', async () => {
    // 상세에서 받아 둔 여행(버전 3)으로 설정을 연다
    const { rerender } = await renderHook(
      ({ t }: { t: Trip }) => useSyncEditDraft('trip-1', t, [JEJU], true),
      { initialProps: { t: trip(3) } },
    );
    // 사용자가 기간을 고르고 이름을 고친다
    await act(async () => {
      useTripEditDraft.getState().setTitle('겨울 바다 2박');
      useTripEditDraft.getState().setRange({ start: '2026-12-20', end: '2026-12-22' });
    });

    // 그사이 친구가 초대를 수락해 버전 4가 된 여행을 새로 받는다(이름·기간·여행지는 그대로)
    await rerender({ t: trip(4) });

    const s = useTripEditDraft.getState();
    expect(s.title).toBe('겨울 바다 2박');
    expect(s.range).toEqual({ start: '2026-12-20', end: '2026-12-22' });
    expect(saveBody()).toEqual({
      expectedVersion: 4,
      title: '겨울 바다 2박',
      startDate: '2026-12-20',
      endDate: '2026-12-22',
    });
  });

  it('다른 동행이 이름을 고친 여행을 받으면 기준을 옮기지 않는다(저장할 때 409로 알게 둔다)', async () => {
    const { rerender } = await renderHook(
      ({ t }: { t: Trip }) => useSyncEditDraft('trip-1', t, [JEJU], true),
      { initialProps: { t: trip(3) } },
    );
    await act(async () => useTripEditDraft.getState().setTitle('내가 고친 이름'));

    await rerender({ t: trip(4, { title: '친구가 고친 이름' }) });

    expect(useTripEditDraft.getState().base?.version).toBe(3);
    expect(useTripEditDraft.getState().title).toBe('내가 고친 이름');
  });

  it('기준보다 오래된 여행으로는 옮기지 않는다', async () => {
    const { rerender } = await renderHook(
      ({ t }: { t: Trip }) => useSyncEditDraft('trip-1', t, [JEJU], true),
      { initialProps: { t: trip(5) } },
    );
    await rerender({ t: trip(4) });
    expect(useTripEditDraft.getState().base?.version).toBe(5);
  });
});
