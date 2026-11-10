import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

import type { MyProfile, Trip } from './types';

/**
 * 개발용 테스트 모드의 가짜 준비물 서버(specs/20261109-112734-checklist/contracts/checklist-api.md).
 * 목록·추가·채택·수정·삭제, 제안 작업 요청과 GET /jobs/{jobId}를 답한다.
 * 서버처럼 지운 항목은 남겨 두고 목록에서만 빼며, 지운 이름과 지금 이름은 다시 제안하지 않는다.
 * 콘솔: globalThis.__devMock.checklist.editByOther('trip-1') 등(준비물 quickstart)
 */

type MockItem = {
  id: string;
  label: string;
  checked: boolean;
  checkedByMemberId: string | null;
  checkedAt: string | null;
  source: 'MANUAL' | 'AI';
  sourceJobId: string | null;
  reason: string | null;
  modifiedByUser: boolean;
  version: number;
  deleted: boolean;
};

type MockJob = {
  id: string;
  tripId: string;
  createdAt: number;
  fail: boolean;
  items: { label: string; reason: string }[];
};

type Helpers = {
  getTrips(): Trip[];
  me: MyProfile;
  /** 내 준비물 추천 설정(AUTO·CONFIRM·OFF). OFF면 409 AI_FEATURE_DISABLED */
  getAiChecklistMode(): string;
  ok<T>(config: InternalAxiosRequestConfig, data: T, status?: number): AxiosResponse<T>;
  fail(config: InternalAxiosRequestConfig, status: number, code: string, message: string): Error;
};

/** 작업이 끝나기까지 걸리는 시간. 화면의 '제안 받는 중'을 볼 수 있게 조금 둔다 */
const JOB_RUN_MS = 2500;
const LABEL_MAX = 255;

/** AI가 고르는 후보. 지금 이름과 지운 이름은 빼고 앞에서 세 개를 제안한다 */
const SUGGESTION_POOL = [
  { label: '선크림', reason: '낮 최고 기온 24도, 자외선 강함' },
  { label: '물티슈', reason: '바닷가 일정이 있어요' },
  { label: '상비약', reason: '2박 3일 일정이에요' },
  { label: '얇은 겉옷', reason: '저녁 기온이 10도 아래예요' },
  { label: '충전 케이블', reason: '하루 종일 밖에 있어요' },
  { label: '보조배터리', reason: '하루 종일 밖에 있어요' },
];

const keyOf = (label: string) => label.trim().replace(/\s+/g, ' ').toLowerCase();

export function createChecklistMock(h: Helpers) {
  let seq = 0;
  let lists = new Map<string, MockItem[]>();
  let jobs = new Map<string, MockJob>();
  let jobByKey = new Map<string, string>();
  let adopted = new Set<string>();
  let failNext = false;
  let aiOff = false;

  const nextId = (prefix: string) => {
    seq += 1;
    return `${prefix}-${seq}`;
  };

  const tripOf = (tripId: string) => h.getTrips().find((t) => t.id === tripId);
  const myMemberId = (trip: Trip) =>
    trip.members.find((m) => m.user.id === h.me.id)?.id ?? trip.members[0]?.id ?? null;

  function item(input: Partial<MockItem> & { label: string }): MockItem {
    return {
      id: nextId('checklist-item'),
      checked: false,
      checkedByMemberId: null,
      checkedAt: null,
      source: 'MANUAL',
      sourceJobId: null,
      reason: null,
      modifiedByUser: false,
      version: 1,
      deleted: false,
      ...input,
    };
  }

  /** 첫 예시 여행(동행이 있는 여행)은 Figma 201-15314와 같은 여섯 항목으로 시작한다. 나머지는 빈 목록 */
  function listOf(trip: Trip): MockItem[] {
    const found = lists.get(trip.id);
    if (found) return found;
    const sample = h.getTrips().find((t) => t.members.length >= 3);
    let list: MockItem[] = [];
    if (sample?.id === trip.id) {
      const me = myMemberId(trip);
      const friend = trip.members.find((m) => m.id !== me)?.id ?? me;
      const at = new Date().toISOString();
      list = [
        item({
          label: '우산',
          source: 'AI',
          reason: '오전 비 70%',
          checked: true,
          checkedByMemberId: friend,
          checkedAt: at,
        }),
        item({ label: '우비', source: 'AI', reason: '오전 비 70%' }),
        item({
          label: '편한 운동화',
          source: 'AI',
          reason: '걷는 일정 2곳',
          checked: true,
          checkedByMemberId: me,
          checkedAt: at,
        }),
        item({
          label: '보조배터리',
          source: 'AI',
          reason: '하루 종일 밖에 있어요',
          checked: true,
          checkedByMemberId: friend,
          checkedAt: at,
        }),
        item({ label: '멀미약 2개', source: 'AI', reason: '배 타는 일정', modifiedByUser: true }),
        item({ label: '손난로' }),
      ];
    }
    lists.set(trip.id, list);
    return list;
  }

  const view = ({ deleted: _deleted, ...rest }: MockItem) => rest;
  const disabled = () => aiOff || h.getAiChecklistMode() === 'OFF';

  function jobView(job: MockJob) {
    const elapsed = Date.now() - job.createdAt;
    const done = elapsed >= JOB_RUN_MS;
    const status = !done
      ? elapsed < 500
        ? 'QUEUED'
        : 'RUNNING'
      : job.fail
        ? 'FAILED'
        : 'SUCCEEDED';
    return {
      id: job.id,
      kind: 'CHECKLIST_SUGGESTIONS',
      status,
      progress: done ? 100 : Math.round((elapsed / JOB_RUN_MS) * 100),
      result:
        status === 'SUCCEEDED'
          ? { items: job.items.map((s) => ({ ...s, sourceJobId: job.id })) }
          : null,
      error:
        status === 'FAILED'
          ? { code: 'AI_FAILED', message: '준비물 제안을 만들지 못했습니다.' }
          : null,
      createdAt: new Date(job.createdAt).toISOString(),
      finishedAt: done ? new Date(job.createdAt + JOB_RUN_MS).toISOString() : null,
    };
  }

  function handle(
    config: InternalAxiosRequestConfig,
    method: string,
    url: string,
  ): AxiosResponse | null {
    const jobMatch = /^\/jobs\/([^/]+)$/.exec(url);
    if (jobMatch && method === 'get') {
      const job = jobs.get(decodeURIComponent(jobMatch[1]));
      if (!job || !tripOf(job.tripId))
        throw h.fail(config, 404, 'JOB_NOT_FOUND', '작업을 찾을 수 없습니다.');
      return h.ok(config, { data: jobView(job) });
    }

    const match = /^\/trips\/([^/]+)\/(checklist|checklist-suggestions)(?:\/([^/]+))?$/.exec(url);
    if (!match) return null;
    const trip = tripOf(decodeURIComponent(match[1]));
    if (!trip) throw h.fail(config, 404, 'TRIP_NOT_FOUND', '여행을 찾을 수 없습니다.');
    const list = listOf(trip);
    const body = (typeof config.data === 'string' ? JSON.parse(config.data || '{}') : {}) as Record<
      string,
      unknown
    >;

    if (match[2] === 'checklist-suggestions') {
      if (method !== 'post' || match[3]) return null;
      if (disabled())
        throw h.fail(
          config,
          409,
          'AI_FEATURE_DISABLED',
          '준비물 추천 설정이 꺼져 있습니다. 설정에서 켠 뒤 다시 시도해 주세요.',
        );
      const key = String(config.headers?.['Idempotency-Key'] ?? '');
      const existing = jobByKey.get(key);
      if (existing)
        return h.ok(
          config,
          { data: { jobId: existing, status: 'QUEUED', statusUrl: `/api/v1/jobs/${existing}` } },
          202,
        );
      const taken = new Set(list.map((i) => keyOf(i.label)));
      const job: MockJob = {
        id: nextId('job-checklist'),
        tripId: trip.id,
        createdAt: Date.now(),
        fail: failNext,
        items: SUGGESTION_POOL.filter((s) => !taken.has(keyOf(s.label))).slice(0, 3),
      };
      failNext = false;
      jobs.set(job.id, job);
      if (key) jobByKey.set(key, job.id);
      return h.ok(
        config,
        { data: { jobId: job.id, status: 'QUEUED', statusUrl: `/api/v1/jobs/${job.id}` } },
        202,
      );
    }

    const itemId = match[3] ? decodeURIComponent(match[3]) : null;
    if (!itemId) {
      if (method === 'get')
        return h.ok(config, { data: { items: list.filter((i) => !i.deleted).map(view) } });
      if (method !== 'post') return null;
      const label = typeof body.label === 'string' ? body.label.trim() : '';
      if (label.length === 0 || label.length > LABEL_MAX)
        throw h.fail(config, 400, 'VALIDATION_ERROR', '준비물 이름은 1~255자로 입력해 주세요.');
      if (body.sourceJobId === undefined && body.suggestionIndex === undefined) {
        const created = item({ label });
        list.push(created);
        return h.ok(config, { data: view(created) }, 201);
      }
      const job = jobs.get(String(body.sourceJobId));
      const index = Number(body.suggestionIndex);
      const picked = job && job.tripId === trip.id && !job.fail ? job.items[index] : undefined;
      if (!job || Date.now() - job.createdAt < JOB_RUN_MS || !picked)
        throw h.fail(config, 400, 'VALIDATION_ERROR', '채택할 수 없는 제안입니다.');
      if (disabled())
        throw h.fail(config, 409, 'AI_FEATURE_DISABLED', '준비물 추천 설정이 꺼져 있습니다.');
      const adoptKey = `${job.id}:${index}`;
      if (adopted.has(adoptKey))
        throw h.fail(config, 409, 'SUGGESTION_ALREADY_ADOPTED', '이미 추가한 준비물 제안입니다.');
      adopted.add(adoptKey);
      const created = item({
        label,
        source: 'AI',
        sourceJobId: job.id,
        reason: picked.reason,
        modifiedByUser: label !== picked.label,
      });
      list.push(created);
      return h.ok(config, { data: view(created) }, 201);
    }

    const target = list.find((i) => i.id === itemId && !i.deleted);
    if (!target)
      throw h.fail(config, 404, 'CHECKLIST_ITEM_NOT_FOUND', '준비물을 찾을 수 없습니다.');
    if (method === 'delete') {
      target.deleted = true;
      return h.ok(config, null, 204);
    }
    if (method !== 'patch') return null;
    if (Number(body.expectedVersion) !== target.version)
      throw h.fail(config, 409, 'VERSION_CONFLICT', '준비물이 변경되었습니다. 다시 조회해 주세요.');
    let changed = false;
    if (typeof body.label === 'string') {
      const label = body.label.trim();
      if (label.length === 0 || label.length > LABEL_MAX)
        throw h.fail(config, 400, 'VALIDATION_ERROR', '준비물 이름은 1~255자로 입력해 주세요.');
      if (label !== target.label) {
        target.label = label;
        if (target.source === 'AI') target.modifiedByUser = true;
        changed = true;
      }
    }
    if (typeof body.checked === 'boolean' && body.checked !== target.checked) {
      target.checked = body.checked;
      target.checkedByMemberId = body.checked ? myMemberId(trip) : null;
      target.checkedAt = body.checked ? new Date().toISOString() : null;
      changed = true;
    }
    if (changed) target.version += 1;
    return h.ok(config, { data: view(target) });
  }

  const firstLive = (tripId: string) => lists.get(tripId)?.find((i) => !i.deleted);

  const controls = {
    /** 다른 동행이 첫 항목의 체크를 바꾼 것처럼 version을 올린다. 다음 체크·고치기가 409를 받는다 */
    editByOther(tripId = 'trip-1') {
      const target = firstLive(tripId);
      const trip = tripOf(tripId);
      if (!target || !trip) return;
      const other = trip.members.find((m) => m.id !== myMemberId(trip))?.id ?? null;
      target.checked = !target.checked;
      target.checkedByMemberId = target.checked ? other : null;
      target.checkedAt = target.checked ? new Date().toISOString() : null;
      target.version += 1;
    },
    /** 다른 동행이 첫 항목을 지운 것처럼 한다. 다음 체크·고치기가 404를 받는다 */
    deleteByOther(tripId = 'trip-1') {
      const target = firstLive(tripId);
      if (target) target.deleted = true;
    },
    /** 다음 제안 작업을 실패로 끝낸다 */
    failNextSuggestion() {
      failNext = true;
    },
    /** 준비물 추천을 끈 것처럼 409 AI_FEATURE_DISABLED를 준다. false로 다시 켠다 */
    disableAi(off = true) {
      aiOff = off;
    },
    reset() {
      lists = new Map();
      jobs = new Map();
      jobByKey = new Map();
      adopted = new Set();
      failNext = false;
      aiOff = false;
    },
  };

  return { handle, controls };
}
