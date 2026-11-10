import { describe, expect, it } from '@jest/globals';

import { commonTopic, pendingChanges, stageEdit, withEdits } from './photo-edit-rules';
import type { PhotoTopic, TripPhoto } from './types';

const photo = (id: string, topics: PhotoTopic[], placeId: string | null = 'p1'): TripPhoto => ({
  id,
  assetId: `a-${id}`,
  tripId: 't1',
  batchId: null,
  uploaderMemberId: 'm1',
  placeId,
  capturedAt: null,
  topics,
  groupId: null,
  version: 3,
});

describe('stageEdit / withEdits', () => {
  it('고른 사진에 바꿈을 쌓고 화면 값에 얹는다', () => {
    let edits = stageEdit({}, ['a', 'b'], { topic: 'FOOD' });
    edits = stageEdit(edits, ['b'], { placeId: 'p2' });
    expect(edits).toEqual({ a: { topic: 'FOOD' }, b: { topic: 'FOOD', placeId: 'p2' } });
    expect(withEdits(photo('b', ['LANDSCAPE']), edits)).toMatchObject({
      topics: ['FOOD'],
      placeId: 'p2',
    });
    expect(withEdits(photo('c', ['OTHER']), edits).topics).toEqual(['OTHER']);
  });
});

describe('commonTopic', () => {
  it('고른 사진의 첫 주제가 모두 같을 때만', () => {
    expect(commonTopic([photo('a', ['FOOD']), photo('b', ['FOOD', 'PEOPLE'])])).toBe('FOOD');
    expect(commonTopic([photo('a', ['FOOD']), photo('b', ['OTHER'])])).toBeNull();
    expect(commonTopic([photo('a', []), photo('b', [])])).toBeNull();
    expect(commonTopic([])).toBeNull();
  });
});

describe('pendingChanges', () => {
  it('지금 값과 다른 것만 보낸다', () => {
    const base = [photo('a', ['FOOD']), photo('b', ['FOOD', 'PEOPLE']), photo('c', [], 'p1')];
    const edits = stageEdit(stageEdit({}, ['a', 'b'], { topic: 'FOOD' }), ['c'], { placeId: 'p1' });
    // a는 이미 FOOD 하나뿐, c는 이미 p1이라 빠지고, b는 두 주제를 FOOD 하나로
    expect(pendingChanges(base, edits)).toEqual([{ photo: base[1], change: { topics: ['FOOD'] } }]);
  });

  it('주제와 장소를 함께 바꾸면 한 번에 보낸다', () => {
    const base = [photo('a', ['OTHER'], 'p1')];
    expect(pendingChanges(base, { a: { topic: 'LANDSCAPE', placeId: 'p2' } })).toEqual([
      { photo: base[0], change: { topics: ['LANDSCAPE'], placeId: 'p2' } },
    ]);
  });
});
