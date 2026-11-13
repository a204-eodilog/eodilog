import { describe, expect, it } from '@jest/globals';

import { ROOM_FACES_SIZE, roomA11yLabel, roomFaceLayout } from './room-faces-rules';

describe('roomFaceLayout (S46 얼굴 묶음)', () => {
  it('1명은 하나, 2명은 대각선 둘, 3명 이상은 삼각형 셋', () => {
    expect(roomFaceLayout(0)).toHaveLength(0);
    expect(roomFaceLayout(1)).toHaveLength(1);
    const two = roomFaceLayout(2);
    expect(two).toHaveLength(2);
    // 두 번째는 첫 번째보다 오른쪽 아래(살짝 겹침)
    expect(two[1].left).toBeGreaterThan(two[0].left);
    expect(two[1].top).toBeGreaterThan(two[0].top);
    expect(two[1].left).toBeLessThan(two[0].size);
    const three = roomFaceLayout(3);
    expect(three).toHaveLength(3);
    // 위 하나, 아래 둘
    expect(three[1].top).toBe(three[2].top);
    expect(three[0].top).toBeLessThan(three[1].top);
    expect(roomFaceLayout(20)).toEqual(three);
  });

  it('어떤 인원이든 44 상자 안에 들어간다', () => {
    for (const n of [1, 2, 3, 6, 20]) {
      for (const f of roomFaceLayout(n)) {
        expect(f.left + f.size).toBeLessThanOrEqual(ROOM_FACES_SIZE);
        expect(f.top + f.size).toBeLessThanOrEqual(ROOM_FACES_SIZE);
      }
    }
  });
});

describe('roomA11yLabel', () => {
  it('방 이름 다음에 참여자 수를 읽는다', () => {
    expect(
      roomA11yLabel({
        title: '강릉 커피 투어 대화방',
        count: 6,
        preview: '나: 그때 봐요',
        time: '14:04',
      }),
    ).toBe('강릉 커피 투어 대화방, 참여자 6명, 나: 그때 봐요, 14:04');
    expect(
      roomA11yLabel({
        title: '부산 바다 여행 대화방',
        count: 3,
        kicker: '여행 중 · 2일차',
        preview: '나: 그때 봐요',
        time: null,
      }),
    ).toBe('부산 바다 여행 대화방, 참여자 3명, 여행 중 · 2일차, 나: 그때 봐요');
  });
});
