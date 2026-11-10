import { describe, expect, it } from '@jest/globals';

import {
  applyMyBallot,
  ballotFailLines,
  decidedLines,
  notVotedLine,
  resultHeadline,
  tieLines,
  closesAtLabel,
  defaultClosesAt,
  isNewCandidate,
  joinNames,
  myVoteSummary,
  notVotedCount,
  pickPoll,
  pollTitle,
  pollViewState,
  remainingLabel,
  seoulDateTime,
  topCandidateIds,
  validateClosesAt,
  voteRatio,
} from './poll-rules';
import { candidate, poll } from './testing';

const NOW = new Date('2026-10-27T12:00:00Z'); // 서울 21:00
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('pollViewState', () => {
  it('투표가 없으면 none', () => {
    expect(pollViewState(null, NOW)).toBe('none');
  });
  it('마감 전 OPEN은 open, 마감 시각이 지난 OPEN은 closing', () => {
    expect(pollViewState(poll({ closesAt: at(HOUR) }), NOW)).toBe('open');
    expect(pollViewState(poll({ closesAt: at(0) }), NOW)).toBe('closing');
  });
  it('FINALIZED 확정 하나는 decided, 둘 이상은 tie', () => {
    expect(pollViewState(poll({ status: 'FINALIZED', selectedCandidateIds: ['c1'] }), NOW)).toBe(
      'decided',
    );
    expect(
      pollViewState(poll({ status: 'FINALIZED', selectedCandidateIds: ['c1', 'c2'] }), NOW),
    ).toBe('tie');
  });
  it('CLOSED는 noVotes', () => {
    expect(pollViewState(poll({ status: 'CLOSED', closedReason: 'NO_VOTES' }), NOW)).toBe(
      'noVotes',
    );
  });
});

describe('remainingLabel', () => {
  it('하루 이상은 일, 한 시간 이상은 시간, 그 밖은 분', () => {
    expect(remainingLabel(at(2 * DAY + HOUR), NOW)).toBe('2일 남았어요');
    expect(remainingLabel(at(DAY), NOW)).toBe('1일 남았어요');
    expect(remainingLabel(at(23 * HOUR + 59 * MIN), NOW)).toBe('23시간 남았어요');
    expect(remainingLabel(at(HOUR), NOW)).toBe('1시간 남았어요');
    expect(remainingLabel(at(59 * MIN), NOW)).toBe('59분 남았어요');
    expect(remainingLabel(at(10_000), NOW)).toBe('1분 남았어요');
  });
  it('지났으면 null', () => {
    expect(remainingLabel(at(0), NOW)).toBeNull();
    expect(remainingLabel(at(-MIN), NOW)).toBeNull();
  });
});

describe('마감 시각', () => {
  it('기본값은 지금부터 24시간 뒤이고 초는 버린다', () => {
    const now = new Date('2026-10-27T12:00:42.500Z');
    expect(defaultClosesAt(now).toISOString()).toBe('2026-10-28T12:00:00.000Z');
  });
  it('지금 이전과 30일 넘는 값은 거절, 정확히 30일은 된다', () => {
    expect(validateClosesAt(new Date(NOW.getTime() - MIN), NOW)).toBe('past');
    expect(validateClosesAt(NOW, NOW)).toBe('past');
    expect(validateClosesAt(new Date(NOW.getTime() + 30 * DAY), NOW)).toBeNull();
    expect(validateClosesAt(new Date(NOW.getTime() + 30 * DAY + MIN), NOW)).toBe('tooFar');
  });
  it('서울 시각으로 보인다', () => {
    expect(seoulDateTime('2026-10-28T12:00:00Z')).toBe('10.28(수) 21:00');
  });
  it('마감 문구는 이틀 안이면 시간, 넘으면 일', () => {
    expect(closesAtLabel(new Date(NOW.getTime() + DAY), NOW)).toBe(
      '10.28(수) 21:00 마감 · 24시간 뒤',
    );
    expect(closesAtLabel(new Date(NOW.getTime() + 3 * DAY), NOW)).toBe(
      '10.30(금) 21:00 마감 · 3일 뒤',
    );
  });
});

describe('후보', () => {
  it('투표를 연 뒤 1분 넘게 늦게 들어온 후보만 새 후보다', () => {
    const first = candidate('c1', { addedAt: at(0) });
    const same = candidate('c2', { addedAt: at(MIN) });
    const later = candidate('c3', { addedAt: at(MIN + 1) });
    const all = [first, same, later];
    expect(isNewCandidate(first, all)).toBe(false);
    expect(isNewCandidate(same, all)).toBe(false);
    expect(isNewCandidate(later, all)).toBe(true);
  });
  it('막대 비율은 투표할 수 있는 동행 수 기준, 0명이면 0', () => {
    expect(voteRatio(2, 3)).toBeCloseTo(2 / 3);
    expect(voteRatio(5, 3)).toBe(1);
    expect(voteRatio(1, 0)).toBe(0);
  });
  it('최다 후보는 동률이면 여럿, 모두 0표면 없음', () => {
    const cs = [
      candidate('c1', { voteCount: 1 }),
      candidate('c2', { voteCount: 1 }),
      candidate('c3', { voteCount: 0 }),
    ];
    expect(topCandidateIds(cs)).toEqual(['c1', 'c2']);
    expect(topCandidateIds([candidate('c1', { voteCount: 0 })])).toEqual([]);
  });
  it('아직 투표하지 않은 인원', () => {
    expect(notVotedCount(poll({ eligibleMemberCount: 3, votedMemberCount: 2 }))).toBe(1);
    expect(notVotedCount(poll({ eligibleMemberCount: 2, votedMemberCount: 3 }))).toBe(0);
  });
});

describe('문구', () => {
  it('자동 제목', () => {
    expect(pollTitle('REGION')).toBe('어디로 갈까요?');
    expect(pollTitle('PLACE')).toBe('어디에 가 볼까요?');
  });
  it('내 선택 요약', () => {
    expect(myVoteSummary([])).toBeNull();
    expect(myVoteSummary(['부산'])).toBe('부산에 투표했어요');
    expect(myVoteSummary(['부산', '강릉'])).toBe('2곳 투표했어요');
  });
  it('이름 잇기', () => {
    expect(joinNames(['부산'])).toBe('부산');
    expect(joinNames(['부산', '강릉'])).toBe('부산과 강릉');
    expect(joinNames(['강릉', '여수'])).toBe('강릉과 여수');
    expect(joinNames(['부산', '강릉', '여수'])).toBe('부산, 강릉과 여수');
  });
  it('투표 바꾸기 실패 문구', () => {
    expect(ballotFailLines(['강릉'], ['부산'])).toEqual([
      '강릉으로 바꾸지 못했어요.',
      '부산 투표는 그대로예요',
    ]);
    expect(ballotFailLines(['여수'], [])).toEqual([
      '여수로 바꾸지 못했어요.',
      '아직 투표하지 않은 그대로예요',
    ]);
    expect(ballotFailLines([], ['부산'])[0]).toBe('투표를 취소하지 못했어요.');
  });
});

describe('pickPoll', () => {
  it('진행 중인 투표 중 가장 최근 것을 고른다', () => {
    const closed = poll({ id: 'p1', status: 'CLOSED' });
    const open = poll({ id: 'p2', closesAt: at(HOUR) });
    const olderOpen = poll({ id: 'p3', closesAt: at(DAY) });
    expect(pickPoll([closed, open, olderOpen], NOW)?.id).toBe('p2');
  });
  it('진행 중이 없으면 가장 최근 투표', () => {
    const latest = poll({ id: 'p1', status: 'FINALIZED', selectedCandidateIds: ['c1'] });
    const old = poll({ id: 'p2', status: 'CLOSED' });
    expect(pickPoll([latest, old], NOW)?.id).toBe('p1');
  });
  it('투표가 없으면 null', () => {
    expect(pickPoll([], NOW)).toBeNull();
  });
});

describe('applyMyBallot', () => {
  const saved = poll({
    candidates: [candidate('c1', { voteCount: 2 }), candidate('c2', { voteCount: 1 })],
    myCandidateIds: ['c1'],
    votedMemberCount: 2,
  });
  it('저장된 내 표를 빼고 화면의 선택을 더한다', () => {
    const view = applyMyBallot(saved, ['c2']);
    expect(view.candidates.map((c) => c.voteCount)).toEqual([1, 2]);
    expect(view.myCandidateIds).toEqual(['c2']);
    expect(view.votedMemberCount).toBe(2);
  });
  it('모두 빼면 투표한 인원에서도 나를 뺀다', () => {
    const view = applyMyBallot(saved, []);
    expect(view.votedMemberCount).toBe(1);
    expect(view.candidates[0].voteCount).toBe(1);
  });
  it('선택이 서버와 같으면 그대로 돌려준다', () => {
    expect(applyMyBallot(saved, ['c1'])).toBe(saved);
  });
});

describe('결과 문구', () => {
  it('최다 하나면 투표가 마감됐어요와 가장 많이 받은 곳으로 확정', () => {
    expect(resultHeadline('decided', ['부산'], 2)).toEqual({
      title: '투표가 마감됐어요',
      sub: '가장 많이 받은 부산으로 확정됐어요',
    });
    expect(resultHeadline('decided', ['제주'], 2).sub).toBe('가장 많이 받은 제주로 확정됐어요');
  });
  it('동률이면 이름을 잇고 이 가를 맞춘다', () => {
    expect(resultHeadline('tie', ['부산', '강릉'], 1).title).toBe('부산과 강릉이 1표씩 같아요');
    expect(resultHeadline('tie', ['강릉', '여수'], 2).title).toBe('강릉과 여수가 2표씩 같아요');
    expect(tieLines(['부산', '강릉'])).toEqual({
      confirmed: '부산과 강릉을 모두 확정했어요',
      heading: '부산과 강릉이 함께 확정됐어요',
    });
    expect(tieLines(['강릉', '제주']).confirmed).toBe('강릉과 제주를 모두 확정했어요');
  });
  it('투표하지 않은 동행 줄', () => {
    expect(notVotedLine(1)).toBe('1명이 투표하지 않고 마감됐어요');
    expect(notVotedLine(0)).toBe('모두 투표하고 마감됐어요');
  });
  it('여행지 확정 카드 두 줄', () => {
    const decided = poll({
      status: 'FINALIZED',
      eligibleMemberCount: 3,
      votedMemberCount: 3,
      candidates: [candidate('c1', { voteCount: 2 }), candidate('c2', { voteCount: 1 })],
    });
    expect(decidedLines(decided)).toEqual({ votes: '3명 중 2표', voters: '모두 투표했어요' });
    expect(decidedLines({ ...decided, votedMemberCount: 2 }).voters).toBe(
      '1명이 투표하지 않았어요',
    );
  });
});
