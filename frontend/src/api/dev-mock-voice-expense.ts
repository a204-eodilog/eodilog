import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

import type { Trip, TripMember } from './types';

/**
 * 개발용 테스트 모드의 말로 경비 입력 가짜 서버(docs/plan/voice-expense-stt-work-split-2026-11-12.md §6).
 * POST /trips/{id}/expense-voice-drafts(202 JobRef) → GET /jobs/voice-job-N(대기 → 처리 중 → 결과)
 * → POST /trips/{id}/expenses/batch(201). 저장한 지출은 GET /trips/{id}/expenses에 나온다.
 * 녹음 파일은 읽지 않는다. 결과는 지금 여행 동행으로 만든다.
 * 콘솔: globalThis.__devMock.voice.next('check') 등. 화면으로는 /dev/voice-expense에서 고른다
 */

/** 다음 분석 결과. normal 두 건 / check 확인 필요(사람 수만·금액 없음) / people 이름 못 맞춤 / count 건수 다름 / 나머지는 실패 코드 */
export type VoiceMockScenario =
  | 'normal'
  | 'check'
  | 'people'
  | 'count'
  | 'VOICE_NO_SPEECH_OR_EXPENSE'
  | 'VOICE_INPUT_LIMIT_EXCEEDED'
  | 'VOICE_EXPENSE_UNSUPPORTED'
  | 'VOICE_PROVIDER_UNAVAILABLE'
  | 'VOICE_AUDIO_INVALID'
  | 'upload';

type MockJob = {
  id: string;
  tripId: string;
  polls: number;
  scenario: VoiceMockScenario;
  createdAt: string;
};

type MockExpense = {
  id: string;
  title: string;
  memo: string | null;
  amountMinor: number;
  currency: 'KRW';
  payerMemberId: string;
  participantMemberIds: string[];
  spentAt: string;
  registeredByMemberId: string;
  shares: { memberId: string; amountMinor: number }[];
  version: number;
};

type Helpers = {
  getTrips(): Trip[];
  meId: string;
  ok<T>(config: InternalAxiosRequestConfig, data: T, status?: number): AxiosResponse<T>;
  fail(config: InternalAxiosRequestConfig, status: number, code: string, message: string): Error;
};

const page = <T>(data: T[]) => ({ data, page: { nextCursor: null, hasNext: false } });

/** 이름 뒤 '이'(받침 있으면) — 말투 예시용 */
function callName(name: string) {
  const last = name.charCodeAt(name.length - 1);
  const batchim = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return batchim ? `${name}이` : name;
}

function shares(amount: number, ids: string[]) {
  const base = Math.floor(amount / ids.length);
  let rest = amount - base * ids.length;
  return ids.map((memberId) => {
    const extra = rest > 0 ? 1 : 0;
    rest -= extra;
    return { memberId, amountMinor: base + extra };
  });
}

export function createVoiceExpenseMock({ getTrips, meId, ok, fail }: Helpers) {
  let seq = 0;
  let nextScenario: VoiceMockScenario = 'normal';
  let failNextSave = false;
  const jobs = new Map<string, MockJob>();
  const byKey = new Map<string, string>();
  const saved = new Map<string, MockExpense[]>();
  const savedByKey = new Map<string, MockExpense[]>();

  function members(trip: Trip) {
    const active = trip.members.filter((m) => m.status === 'ACTIVE');
    const me = active.find((m) => m.user.id === meId) ?? active[0];
    const others = active.filter((m) => m.id !== me?.id);
    return { me, a: others[0] ?? me, b: others[1] ?? others[0] ?? me };
  }

  function draft(
    i: number,
    segment: string,
    d: {
      title: string | null;
      amount: number | null;
      payer: TripMember | null;
      people: TripMember[];
    },
    warnings: { code: string; field: string | null; message: string }[] = [],
  ) {
    return {
      draftId: `draft-${seq}-${i}`,
      transcriptSegment: segment,
      draft: {
        title: d.title,
        memo: null,
        amountMinor: d.amount,
        currency: 'KRW' as const,
        payerMemberId: d.payer?.id ?? null,
        participantMemberIds: d.people.map((m) => m.id),
        spentAt: null,
      },
      unresolvedFields: ['spentAt', ...warnings.map((w) => w.field ?? '')].filter(Boolean),
      warnings,
    };
  }

  function result(trip: Trip, scenario: VoiceMockScenario) {
    const { me, a, b } = members(trip);
    const an = a.user.nickname;
    const bn = b.user.nickname;
    if (scenario === 'check') {
      const s1 = '택시비 2만 4천 원 내가 냈고 셋이 나눠';
      const s2 = `커피는 ${callName(an)}가 냈고 둘이 나눠`;
      return {
        transcript: `${s1}. ${s2}.`,
        drafts: [
          draft(1, s1, { title: '택시비', amount: 24000, payer: me, people: [] }, [
            {
              code: 'PARTICIPANTS_UNKNOWN',
              field: 'participantMemberIds',
              message: '나눌 사람을 골라 주세요',
            },
          ]),
          draft(2, s2, { title: '커피', amount: null, payer: a, people: [] }, [
            { code: 'AMOUNT_MISSING', field: 'amountMinor', message: '금액을 넣어 주세요' },
            {
              code: 'PARTICIPANTS_UNKNOWN',
              field: 'participantMemberIds',
              message: '나눌 사람을 골라 주세요',
            },
          ]),
        ],
        warnings: [],
      };
    }
    if (scenario === 'people') {
      const s1 = `택시비 2만 4천 원 내가 냈고 나랑 민수랑 ${callName(bn)} 나눠`;
      const s2 = `커피 만 2천 원은 ${callName(an)}가 냈고 둘이 나눠`;
      return {
        transcript: `${s1}. ${s2}.`,
        drafts: [
          draft(1, s1, { title: '택시비', amount: 24000, payer: me, people: [me, b] }, [
            {
              code: 'MEMBER_NOT_FOUND',
              field: 'participantMemberIds',
              message: '‘민수’는 이 여행 동행에 없어요',
            },
          ]),
          draft(2, s2, { title: '커피', amount: 12000, payer: null, people: [me, a] }, [
            {
              code: 'MEMBER_AMBIGUOUS',
              field: 'payerMemberId',
              message: `‘${an}’이 두 명이에요. 골라 주세요`,
            },
          ]),
        ],
        warnings: [],
      };
    }
    const s1 = `택시비 2만 4천 원 내가 냈고 나랑 ${an}랑 ${callName(bn)} 나눠`;
    const s2 = `커피 만 2천 원은 ${callName(an)}가 냈고 나랑 둘이 나눠`;
    const base = {
      transcript: `${s1}. ${s2}.${scenario === 'count' ? ' 그리고 점심은…' : ''}`,
      drafts: [
        draft(1, s1, { title: '택시비', amount: 24000, payer: me, people: [me, a, b] }),
        draft(2, s2, { title: '커피', amount: 12000, payer: a, people: [me, a] }),
      ],
      warnings:
        scenario === 'count'
          ? [
              {
                code: 'COUNT_MISMATCH',
                field: null,
                message: '말한 지출과 초안 수가 다를 수 있어요',
              },
            ]
          : [],
    };
    return base;
  }

  function jobBody(job: MockJob, trip: Trip) {
    const status = job.polls <= 1 ? 'QUEUED' : job.polls <= 2 ? 'RUNNING' : 'DONE';
    const common = {
      id: job.id,
      kind: 'VOICE_EXPENSE_DRAFT',
      progress: 0,
      createdAt: job.createdAt,
    };
    if (status !== 'DONE')
      return { ...common, status, result: null, error: null, finishedAt: null };
    const finishedAt = new Date().toISOString();
    if (job.scenario.startsWith('VOICE_')) {
      return {
        ...common,
        status: 'FAILED',
        result: null,
        error: { code: job.scenario, message: '분석하지 못했어요' },
        finishedAt,
      };
    }
    return {
      ...common,
      status: 'SUCCEEDED',
      progress: 100,
      result: result(trip, job.scenario),
      error: null,
      finishedAt,
    };
  }

  function handle(
    config: InternalAxiosRequestConfig,
    method: string,
    url: string,
  ): AxiosResponse | null {
    const intake = /^\/trips\/([^/]+)\/expense-voice-drafts$/.exec(url);
    if (method === 'post' && intake) {
      const trip = getTrips().find((t) => t.id === intake[1]);
      if (!trip) throw fail(config, 404, 'TRIP_NOT_FOUND', '여행을 찾을 수 없어요');
      if (nextScenario === 'upload') {
        nextScenario = 'normal';
        // 서버에 닿지 못한 것처럼(응답 없음)
        const e = new Error('Network Error') as Error & { isAxiosError: boolean; config: unknown };
        e.isAxiosError = true;
        e.config = config;
        throw e;
      }
      const key = String(config.headers?.['Idempotency-Key'] ?? '');
      const known = key ? byKey.get(key) : undefined;
      const id = known ?? `voice-job-${++seq}`;
      if (!known) {
        jobs.set(id, {
          id,
          tripId: trip.id,
          polls: 0,
          scenario: nextScenario,
          createdAt: new Date().toISOString(),
        });
        if (key) byKey.set(key, id);
        nextScenario = 'normal';
      }
      return ok(
        config,
        { data: { jobId: id, status: 'QUEUED', statusUrl: `/api/v1/jobs/${id}` } },
        202,
      );
    }

    const jobMatch = /^\/jobs\/(voice-job-\d+)$/.exec(url);
    if (method === 'get' && jobMatch) {
      const job = jobs.get(jobMatch[1]);
      const trip = job ? getTrips().find((t) => t.id === job.tripId) : undefined;
      // 모르는 작업은 결과 만료와 같다(/trips/{id}/expenses/voice/voice-job-0으로 열면 만료 화면)
      if (!job || !trip) throw fail(config, 404, 'JOB_NOT_FOUND', '작업을 찾을 수 없어요');
      job.polls += 1;
      return ok(config, { data: jobBody(job, trip) });
    }

    const batch = /^\/trips\/([^/]+)\/expenses\/batch$/.exec(url);
    if (method === 'post' && batch) {
      const trip = getTrips().find((t) => t.id === batch[1]);
      if (!trip) throw fail(config, 404, 'TRIP_NOT_FOUND', '여행을 찾을 수 없어요');
      if (failNextSave) {
        failNextSave = false;
        throw fail(config, 500, 'INTERNAL_ERROR', '저장하지 못했어요');
      }
      const key = String(config.headers?.['Idempotency-Key'] ?? '');
      const again = key ? savedByKey.get(key) : undefined;
      if (again) return ok(config, { data: { expenses: again } }, 201);
      const body = (typeof config.data === 'string' ? JSON.parse(config.data) : config.data) as {
        items: Omit<MockExpense, 'id' | 'registeredByMemberId' | 'shares' | 'version'>[];
      };
      if (!body.items?.length || body.items.length > 10) {
        throw fail(config, 400, 'VALIDATION_ERROR', '1~10건만 저장할 수 있어요');
      }
      const me = members(trip).me;
      const created = body.items.map((it, i) => ({
        ...it,
        id: `voice-exp-${seq}-${i}-${Date.now()}`,
        registeredByMemberId: me.id,
        shares: shares(it.amountMinor, it.participantMemberIds),
        version: 1,
      }));
      saved.set(trip.id, [...created, ...(saved.get(trip.id) ?? [])]);
      if (key) savedByKey.set(key, created);
      return ok(config, { data: { expenses: created } }, 201);
    }

    // 말로 저장한 지출이 있는 여행은 그 지출을 목록에 보여 준다(나머지 테스트 모드 여행은 지출이 비어 있다)
    const list = /^\/trips\/([^/]+)\/expenses$/.exec(url);
    if (method === 'get' && list && saved.has(list[1])) {
      return ok(config, page(saved.get(list[1]) ?? []));
    }
    return null;
  }

  const controls = {
    /** 다음 분석 결과를 정한다 */
    next(scenario: VoiceMockScenario) {
      nextScenario = scenario;
    },
    /** 다음 일괄 저장을 실패시킨다 */
    failNextSave() {
      failNextSave = true;
    },
    reset() {
      nextScenario = 'normal';
      failNextSave = false;
      saved.clear();
    },
  };

  return { handle, controls };
}
