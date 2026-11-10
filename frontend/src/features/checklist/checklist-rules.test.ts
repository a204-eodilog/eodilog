import { describe, expect, it } from '@jest/globals';

import {
  checkerName,
  labelKey,
  metaLine,
  progressLabel,
  progressRatio,
  sourceTag,
  validateLabel,
} from './checklist-rules';
import { checklistItem } from './testing';

const members = [
  { id: 'm-seeun', name: '세은' },
  { id: 'm-minsu', name: '민수' },
];

describe('진행', () => {
  it('챙긴 수와 전체 수를 보인다', () => {
    const items = [
      checklistItem({ checked: true }),
      checklistItem({ checked: false }),
      checklistItem({ checked: true }),
    ];
    expect(progressLabel(items)).toBe('3개 중 2개 챙겼어요');
    expect(progressRatio(items)).toBeCloseTo(2 / 3);
  });

  it('모두 챙기면 모두 챙겼어요', () => {
    expect(progressLabel([checklistItem({ checked: true })])).toBe('1개 모두 챙겼어요');
  });

  it('항목이 없으면 0', () => {
    expect(progressLabel([])).toBe('0개 중 0개 챙겼어요');
    expect(progressRatio([])).toBe(0);
  });
});

describe('챙긴 사람', () => {
  it('멤버 ID로 이름을 찾고 없으면 동행', () => {
    expect(checkerName('m-seeun', members)).toBe('세은');
    expect(checkerName('m-left', members)).toBe('동행');
    expect(checkerName(null, members)).toBeNull();
  });

  it('이유와 챙긴 사람을 한 줄로 잇는다', () => {
    const item = checklistItem({
      source: 'AI',
      reason: '오전 비 70%',
      checked: true,
      checkedByMemberId: 'm-seeun',
    });
    expect(metaLine(item, members)).toBe('오전 비 70% · 세은이 챙겨요');
  });

  it('받침 없는 이름은 가', () => {
    const item = checklistItem({ checked: true, checkedByMemberId: 'm-minsu' });
    expect(metaLine(item, members)).toBe('민수가 챙겨요');
  });

  it('챙기지 않았으면 이유만, 둘 다 없으면 null', () => {
    expect(metaLine(checklistItem({ source: 'AI', reason: '오전 비 70%' }), members)).toBe(
      '오전 비 70%',
    );
    expect(metaLine(checklistItem({ reason: '  ' }), members)).toBeNull();
  });

  it('해제된 항목에 남은 멤버 ID는 보이지 않는다', () => {
    const item = checklistItem({ checked: false, checkedByMemberId: 'm-seeun' });
    expect(metaLine(item, members)).toBeNull();
  });
});

describe('출처 표시', () => {
  it('직접 쓴 항목은 직접 추가, 고친 AI 제안은 직접 고침, 그대로인 AI 제안은 없음', () => {
    expect(sourceTag(checklistItem({ source: 'MANUAL' }))).toBe('직접 추가');
    expect(sourceTag(checklistItem({ source: 'AI', modifiedByUser: true }))).toBe('직접 고침');
    expect(sourceTag(checklistItem({ source: 'AI', modifiedByUser: false }))).toBeNull();
  });
});

describe('이름', () => {
  it('앞뒤 공백을 빼고 1~255자만 받는다', () => {
    expect(validateLabel('  손난로 ')).toBe('손난로');
    expect(validateLabel('   ')).toBeNull();
    expect(validateLabel('가'.repeat(255))).toHaveLength(255);
    expect(validateLabel('가'.repeat(256))).toBeNull();
  });

  it('비교 키는 공백과 영문 대소문자를 무시한다', () => {
    expect(labelKey(' 보조  배터리 ')).toBe(labelKey('보조 배터리'));
    expect(labelKey('USB 케이블')).toBe(labelKey('usb 케이블'));
  });
});
