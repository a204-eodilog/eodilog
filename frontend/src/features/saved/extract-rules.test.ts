import { describe, expect, it } from '@jest/globals';

import {
  addCaptures,
  canFind,
  candidateLetter,
  extractRegion,
  extractItems,
  extractionView,
  failCause,
  failedNotice,
  groupCandidates,
  cleanLinkInput,
  isLink,
  linkIn,
  nextToChoose,
  parseAddStart,
  linkLabel,
  linkStatus,
  progressStep,
  shownStep,
  stepByTime,
  stepDetail,
  EXTRACTION_STEP_GUIDES,
  EXTRACTION_STEPS,
  withoutBranch,
} from './extract-rules';
import type { ExtractionCandidate, ExtractionResult, Job, Place } from './types';

const place: Place = {
  id: 'p1',
  name: '바다 앞 카페',
  address: '부산광역시 수영구 남천동',
  latitude: 35.14,
  longitude: 129.11,
  regionId: null,
  provider: 'NAVER',
  providerPlaceId: null,
  source: 'PROVIDER',
};

function job(status: Job['status'], progress = 100): Job {
  return {
    id: 'job-1',
    kind: 'PLACE_EXTRACTION',
    status,
    progress,
    result: null,
    error: null,
    createdAt: '2026-11-06T00:00:00Z',
    finishedAt: null,
  };
}

function candidate(id: string, withPlace = true): ExtractionCandidate {
  return {
    candidateId: id,
    name: id,
    place: withPlace ? { ...place, id } : null,
    evidence: '게시물 글에서 찾았어요',
    confidence: null,
  };
}

/** 한 언급(name)의 지점 하나. 지점 이름은 place.name에 있다 */
function branch(id: string, name: string, placeName = name): ExtractionCandidate {
  return { ...candidate(id), name, place: { ...place, id, name: placeName } };
}

function result(
  status: Job['status'],
  resultStatus: ExtractionResult['resultStatus'],
  candidates: ExtractionCandidate[] = [],
): ExtractionResult {
  return { job: job(status), resultStatus, candidates };
}

describe('linkIn / cleanLinkInput (지도 앱 공유 글)', () => {
  const shared =
    '[네이버지도]\n만족오향족발 시청점\n서울 중구 서소문로 134-7\nhttps://naver.me/5abCdEfG';

  it('공유 글에서 링크만 고른다', () => {
    expect(linkIn(shared)).toBe('https://naver.me/5abCdEfG');
    expect(linkIn('https://sns.example.com/p/1')).toBe('https://sns.example.com/p/1');
    expect(linkIn('노을 질 때 가 보기')).toBeNull();
    expect(linkIn(null)).toBeNull();
  });

  it('여러 낱말이 섞인 글이면 링크만 남기고, 치는 중인 한 낱말은 그대로 둔다', () => {
    expect(cleanLinkInput(shared)).toBe('https://naver.me/5abCdEfG');
    expect(cleanLinkInput('https://naver.me/5ab')).toBe('https://naver.me/5ab');
    expect(cleanLinkInput('naver')).toBe('naver');
    expect(cleanLinkInput('링크가 없는 글')).toBe('링크가 없는 글');
    expect(linkStatus(cleanLinkInput(shared))).toBe('ok');
  });
});

describe('isLink / linkStatus (S11)', () => {
  it('http(s) 웹 주소만 링크로 본다', () => {
    expect(isLink(' https://sns.example.com/p/8Kd2 ')).toBe(true);
    expect(isLink('http://blog.example.com')).toBe(true);
    expect(isLink('sns.example.com/p/8Kd2')).toBe(false);
    expect(isLink('https://localhost')).toBe(false);
    expect(isLink('노을 질 때 가 보기')).toBe(false);
    expect(isLink(null)).toBe(false);
  });

  it('파일 링크와 링크가 아닌 글은 지원하지 않는 형식', () => {
    expect(linkStatus('')).toBe('empty');
    expect(linkStatus('  ')).toBe('empty');
    expect(linkStatus('https://sns.example.com/p/8Kd2')).toBe('ok');
    expect(linkStatus('https://example.com/menu.pdf')).toBe('unsupported');
    expect(linkStatus('https://example.com/video.MP4')).toBe('unsupported');
    expect(linkStatus('그냥 글')).toBe('unsupported');
  });

  it('서버가 거부하는 링크(계정 정보, 80·443 외 포트, 2048자 초과)도 지원하지 않는 형식', () => {
    expect(linkStatus('https://user@example.com/p/1')).toBe('unsupported');
    expect(linkStatus('https://user:pw@example.com/p/1')).toBe('unsupported');
    expect(linkStatus('https://example.com:8080/p/1')).toBe('unsupported');
    expect(linkStatus('https://example.com:443/p/1')).toBe('ok');
    expect(linkStatus('http://example.com:80/p/1')).toBe('ok');
    expect(linkStatus('https://example.com/p/1?ref=a@b')).toBe('ok');
    const long = `https://example.com/${'a'.repeat(2048)}`;
    expect(linkStatus(long)).toBe('unsupported');
    expect(linkStatus(long.slice(0, 2048))).toBe('ok');
  });
});

describe('canFind (S11)', () => {
  it('링크나 캡처가 하나 이상 있어야 한다', () => {
    expect(canFind('', 0)).toBe(false);
    expect(canFind('', 1)).toBe(true);
    expect(canFind('https://sns.example.com/p/1', 0)).toBe(true);
  });

  it('링크 칸이 지원하지 않는 형식이면 캡처가 있어도 막는다', () => {
    expect(canFind('https://example.com/menu.pdf', 2)).toBe(false);
  });
});

describe('addCaptures (S11)', () => {
  const shot = (n: number, contentType = 'image/png') => ({ id: n, contentType });

  it('10장까지만 받고 넘친 장수를 알려 준다', () => {
    const current = Array.from({ length: 8 }, (_, i) => shot(i));
    const out = addCaptures(current, [shot(8), shot(9), shot(10)]);
    expect(out.captures).toHaveLength(10);
    expect(out.skippedLimit).toBe(1);
    expect(out.skippedType).toBe(0);
  });

  it('JPG·PNG가 아니면 뺀다', () => {
    const out = addCaptures([], [shot(1, 'image/heic'), shot(2, 'image/jpeg')]);
    expect(out.captures.map((c) => c.id)).toEqual([2]);
    expect(out.skippedType).toBe(1);
  });
});

describe('linkLabel', () => {
  it('주소에서 https·www·끝 / 를 뺀다', () => {
    expect(linkLabel('https://www.sns.example.com/p/8Kd2/')).toBe('sns.example.com/p/8Kd2');
    expect(linkLabel('https://blog.example.com/')).toBe('blog.example.com');
  });

  it('길면 줄인다', () => {
    expect(linkLabel('https://blog.example.com/a/very/long/path/name', 20)).toBe(
      'blog.example.com/a/…',
    );
  });
});

describe('extractionView (S12)', () => {
  it('작업이 끝나기 전이면 진행 중', () => {
    expect(extractionView(result('QUEUED', null))).toBe('progress');
    expect(extractionView(result('RUNNING', null))).toBe('progress');
  });

  it('작업 실패·취소나 결과 FAILED면 처리 실패', () => {
    expect(extractionView(result('FAILED', null))).toBe('failed');
    expect(extractionView(result('CANCELLED', null))).toBe('failed');
    expect(extractionView(result('SUCCEEDED', 'FAILED'))).toBe('failed');
  });

  it('언급이 없으면 식별 불가', () => {
    expect(extractionView(result('SUCCEEDED', 'NOT_FOUND'))).toBe('notFound');
    expect(extractionView(result('SUCCEEDED', 'MULTIPLE_CANDIDATES', []))).toBe('notFound');
  });

  it('지도에서 못 찾은 언급만 있으면 성공 목록(직접 찾기 줄)', () => {
    expect(
      extractionView(result('SUCCEEDED', 'MULTIPLE_CANDIDATES', [candidate('a', false)])),
    ).toBe('success');
  });

  it('성공과 복수 후보', () => {
    expect(extractionView(result('SUCCEEDED', 'SUCCESS', [candidate('a'), candidate('b')]))).toBe(
      'success',
    );
    // 같은 이름(한 언급)의 여러 지점이면 복수 후보
    expect(
      extractionView(
        result('SUCCEEDED', 'MULTIPLE_CANDIDATES', [branch('c1', '카페'), branch('c2', '카페')]),
      ),
    ).toBe('multiple');
    // 이름이 다른 장소 둘은 각각 한 곳이라 고를 것이 없다
    expect(
      extractionView(result('SUCCEEDED', 'MULTIPLE_CANDIDATES', [candidate('a'), candidate('b')])),
    ).toBe('success');
  });

  it('시간이 지났는데 아직 진행 중이면 처리 실패, 이미 끝났으면 결과 그대로', () => {
    expect(extractionView(result('QUEUED', null), true)).toBe('failed');
    expect(extractionView(result('RUNNING', null), true)).toBe('failed');
    expect(extractionView(result('SUCCEEDED', 'NOT_FOUND'), true)).toBe('notFound');
  });
});

describe('groupCandidates / nextToChoose / extractItems (S12 언급별 묶음)', () => {
  // 확정 가게 A + 지점 둘인 카페 + 지도에서 못 찾은 빵집
  const candidates = [
    candidate('A'),
    branch('c1', '카페', '카페 남천점'),
    branch('c2', '카페', '카페 광안점'),
    { ...candidate('빵집', false), candidateId: 'b1' },
  ];
  const groups = groupCandidates(candidates);

  it('같은 name을 한 묶음으로, 처음 나온 순서대로', () => {
    expect(groups.map((g) => [g.key, g.name, g.options.length])).toEqual([
      ['A', 'A', 1],
      ['c1', '카페', 2],
      ['b1', '빵집', 0],
    ]);
  });

  it('지점이 여럿인 묶음을 먼저 고르고, 고르거나 빼면 다음으로', () => {
    expect(nextToChoose(groups, {}, [])?.key).toBe('c1');
    const pick = { place: groups[1].options[1].place, evidence: 'x' };
    expect(nextToChoose(groups, { c1: pick }, [])).toBeNull();
    expect(nextToChoose(groups, {}, ['c1'])).toBeNull();
  });

  it('성공 목록: 확정 가게는 그대로, 고른 지점은 지점 이름, 못 찾은 언급은 장소 없이', () => {
    // 고르기 전에는 여러 지점 묶음이 목록에 없다(확정 가게 A는 사라지지 않는다)
    expect(extractItems(groups, {}, []).map((i) => i.key)).toEqual(['A', 'b1']);
    const pick = { place: groups[1].options[1].place, evidence: '게시물 글에서 찾았어요' };
    const items = extractItems(groups, { c1: pick }, ['A']);
    expect(items.map((i) => [i.key, i.name, i.place?.id ?? null])).toEqual([
      ['c1', '카페 광안점', 'c2'],
      ['b1', '빵집', null],
    ]);
  });
});

describe('failedNotice (S12 처리 실패 글)', () => {
  it('보낸 입력에 맞춰 무엇을 읽지 못했는지 말한다', () => {
    expect(failedNotice({ link: 'instagram.com/p/1', captureCount: 0 })).toEqual({
      icon: 'link',
      title: '링크를 열지 못했어요',
      description: '불러오지 못했어요',
    });
    expect(failedNotice({ link: null, captureCount: 3 })).toMatchObject({
      icon: 'image',
      title: '캡처를 읽지 못했어요',
    });
    expect(failedNotice({ link: 'instagram.com/p/1', captureCount: 2 })).toMatchObject({
      icon: 'link',
      title: '링크와 캡처를 읽지 못했어요',
    });
  });

  it('보낸 입력을 모르면 일반 문구', () => {
    expect(failedNotice(null)).toMatchObject({
      icon: 'alert',
      title: '장소 찾기를 마치지 못했어요',
    });
  });

  it('늦거나 서버가 실패하면 보낸 것과 상관없이 링크·캡처를 탓하지 않는다', () => {
    const inputs = [
      { link: 'instagram.com/p/1', captureCount: 0 },
      { link: null, captureCount: 1 },
      { link: 'instagram.com/p/1', captureCount: 2 },
      null,
    ];
    for (const sent of inputs) {
      expect(failedNotice(sent, 'late')).toEqual({
        icon: 'clock',
        title: '장소 찾기가 늦어지고 있어요',
        description: '시간이 너무 오래 걸려요. 다시 시도해 주세요',
      });
      expect(failedNotice(sent, 'server')).toEqual({
        icon: 'alert',
        title: '장소 찾기를 마치지 못했어요',
        description: '잠시 문제가 생겼어요. 다시 시도해 주세요',
      });
    }
  });
});

describe('failCause (S12 처리 실패 이유)', () => {
  const result = (status: string, resultStatus: string | null) =>
    ({ job: { status }, resultStatus, candidates: [] }) as unknown as ExtractionResult;

  it('아직 대기·처리 중인데 시간이 지나면 늦어진 것', () => {
    expect(failCause(result('QUEUED', null), true)).toBe('late');
    expect(failCause(result('RUNNING', null), true)).toBe('late');
  });

  it('작업 실패(일시 오류·시간 초과 등)는 서버 문제', () => {
    expect(failCause(result('FAILED', null), false)).toBe('server');
    expect(failCause(result('FAILED', null), true)).toBe('server');
  });

  it('작업은 끝났는데 자료를 못 읽었으면 읽지 못한 것', () => {
    expect(failCause(result('SUCCEEDED', 'FAILED'), false)).toBe('unreadable');
  });
});

describe('stepDetail (S12 지금 하는 일)', () => {
  it('첫 단계는 보낸 입력에 맞춘다', () => {
    expect(stepDetail(0, { link: 'a.com', captureCount: 2 })).toBe(
      '게시물 글과 캡처 2장을 읽고 있어요',
    );
    expect(stepDetail(0, { link: 'a.com', captureCount: 0 })).toBe('링크 속 글을 읽고 있어요');
    expect(stepDetail(0, { link: null, captureCount: 3 })).toBe('캡처 3장을 읽고 있어요');
    expect(stepDetail(0, null)).toBe('보낸 내용을 읽고 있어요');
  });

  it('다음 단계는 입력과 상관없이 같은 글', () => {
    expect(stepDetail(1, null)).toBe('가게 이름과 주소를 찾고 있어요');
    expect(stepDetail(2, { link: null, captureCount: 1 })).toBe('찾은 곳을 지도에 올리고 있어요');
  });
});

describe('stepByTime / shownStep (S12 단계 넘기기)', () => {
  it('기다린 시간에 맞춰 단계를 넘긴다', () => {
    expect(stepByTime(0)).toBe(0);
    expect(stepByTime(3999)).toBe(0);
    expect(stepByTime(4000)).toBe(1);
    expect(stepByTime(9000)).toBe(2);
    expect(stepByTime(60_000)).toBe(2);
  });

  it('서버 진행률과 시간 중 더 나아간 쪽을 보인다', () => {
    expect(shownStep(0, 5000)).toBe(1);
    expect(shownStep(70, 0)).toBe(2);
    expect(shownStep(40, 10_000)).toBe(2);
  });

  it('단계마다 설명이 하나씩 있다', () => {
    expect(EXTRACTION_STEP_GUIDES).toHaveLength(EXTRACTION_STEPS.length);
  });
});

describe('progressStep / candidateLetter', () => {
  it('진행률을 세 단계로 나눈다', () => {
    expect(progressStep(0)).toBe(0);
    expect(progressStep(33)).toBe(0);
    expect(progressStep(34)).toBe(1);
    expect(progressStep(67)).toBe(2);
    expect(progressStep(100)).toBe(2);
  });

  it('후보 글자', () => {
    expect([0, 1, 2].map(candidateLetter)).toEqual(['A', 'B', 'C']);
  });
});

describe('extractRegion (S12)', () => {
  const center = (r: NonNullable<ReturnType<typeof extractRegion>>) => [
    r.latitude + r.latitudeDelta / 2,
    r.longitude + r.longitudeDelta / 2,
  ];

  it('장소들의 가운데가 지도 가운데', () => {
    const r = extractRegion(
      [
        { latitude: 35.15, longitude: 129.06 },
        { latitude: 35.16, longitude: 129.12 },
      ],
      0.6,
    )!;
    const [lat, lng] = center(r);
    expect(lat).toBeCloseTo(35.155, 6);
    expect(lng).toBeCloseTo(129.09, 6);
  });

  it('지도 칸 비율에 맞춰 delta를 맞춘다(세로로 긴 지도면 위도 폭이 더 넓다)', () => {
    const r = extractRegion([{ latitude: 35.15, longitude: 129.1 }], 0.5)!;
    const ratio = r.longitudeDelta / r.latitudeDelta;
    expect(ratio).toBeCloseTo(0.5 / Math.cos((35.15 * Math.PI) / 180), 6);
    // 두 장소가 모두 범위 안
    const wide = extractRegion(
      [
        { latitude: 35.0, longitude: 129.0 },
        { latitude: 35.0, longitude: 129.3 },
      ],
      0.5,
    )!;
    expect(wide.longitude).toBeLessThan(129.0);
    expect(wide.longitude + wide.longitudeDelta).toBeGreaterThan(129.3);
  });

  it('장소가 없거나 지도 크기를 모르면 null', () => {
    expect(extractRegion([], 0.5)).toBeNull();
    expect(extractRegion([{ latitude: 35, longitude: 129 }], 0)).toBeNull();
  });
});

describe('parseAddStart', () => {
  it('S10 시작 카드가 넘긴 값만 받는다', () => {
    expect(parseAddStart('link')).toBe('link');
    expect(parseAddStart('capture')).toBe('capture');
    expect(parseAddStart(['capture', 'link'])).toBe('capture');
  });

  it('없거나 모르는 값이면 보통으로 연다', () => {
    expect(parseAddStart(undefined)).toBeNull();
    expect(parseAddStart('photo')).toBeNull();
  });
});

describe('withoutBranch', () => {
  it('띄어 쓴 지점 표시만 뗀다', () => {
    expect(withoutBranch('강릉길감자 본점')).toBe('강릉길감자');
    expect(withoutBranch('스타벅스 강남역점')).toBe('스타벅스');
    expect(withoutBranch('교촌치킨 2호점')).toBe('교촌치킨');
    expect(withoutBranch('본점')).toBe('본점');
    expect(withoutBranch('카페정점')).toBe('카페정점');
  });
});

describe('상호의 업종명 보존', () => {
  it.each([
    '부산 중국음식점',
    '제주 기념품점',
    '서울 독립서점',
    '동네 문구점',
    '우리 제과점',
    '행복 백화점',
  ])('%s를 지점으로 잘라내지 않는다', (name) => {
    expect(withoutBranch(name)).toBe(name);
  });
});
