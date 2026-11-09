import { describe, expect, it } from '@jest/globals';

import {
  addCaptures,
  canFind,
  candidateLetter,
  extractRegion,
  extractionView,
  failedNotice,
  isLink,
  linkLabel,
  linkStatus,
  progressStep,
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

function result(
  status: Job['status'],
  resultStatus: ExtractionResult['resultStatus'],
  candidates: ExtractionCandidate[] = [],
): ExtractionResult {
  return { job: job(status), resultStatus, candidates };
}

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

  it('찾지 못했거나 지도에서 찾은 후보가 없으면 식별 불가', () => {
    expect(extractionView(result('SUCCEEDED', 'NOT_FOUND'))).toBe('notFound');
    expect(extractionView(result('SUCCEEDED', 'SUCCESS', [candidate('a', false)]))).toBe(
      'notFound',
    );
  });

  it('성공과 복수 후보', () => {
    expect(extractionView(result('SUCCEEDED', 'SUCCESS', [candidate('a'), candidate('b')]))).toBe(
      'success',
    );
    expect(
      extractionView(result('SUCCEEDED', 'MULTIPLE_CANDIDATES', [candidate('a'), candidate('b')])),
    ).toBe('multiple');
    // 지도에서 찾은 후보가 하나뿐이면 고를 것이 없어 성공으로 본다
    expect(
      extractionView(
        result('SUCCEEDED', 'MULTIPLE_CANDIDATES', [candidate('a'), candidate('b', false)]),
      ),
    ).toBe('success');
  });

  it('시간이 지났는데 아직 진행 중이면 처리 실패, 이미 끝났으면 결과 그대로', () => {
    expect(extractionView(result('QUEUED', null), true)).toBe('failed');
    expect(extractionView(result('RUNNING', null), true)).toBe('failed');
    expect(extractionView(result('SUCCEEDED', 'NOT_FOUND'), true)).toBe('notFound');
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

  it('보낸 입력을 모르면 일반 문구, 시간 초과면 설명이 바뀐다', () => {
    expect(failedNotice(null)).toMatchObject({
      icon: 'alert',
      title: '장소 찾기를 마치지 못했어요',
    });
    expect(failedNotice({ link: null, captureCount: 1 }, true).description).toBe(
      '시간이 너무 오래 걸려요. 다시 시도해 주세요',
    );
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
