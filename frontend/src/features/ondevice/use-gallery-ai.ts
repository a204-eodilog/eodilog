// 폰 AI로 내 폰 사진 정리(주제, 비슷한 사진, 문장 검색). 사진은 서버로 보내지 않는다.
// S30 사진 올리기(그 여행 기간)와 '내 사진 찾기'(내 모든 여행 기간)가 같이 쓴다.
// 순서: (AI 설정 확인) → 모델 받기(모바일 데이터면 먼저 묻는다) → 사진 권한 → 기간 사진 정리
import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { collapseGroups } from '../photo/photo-list-rules';
import { embedText, loadModels, type Models, type Topic } from './engine';
import {
  analyzeGallery,
  ensureGalleryPermission,
  tripGalleryPhotos,
  type AnalyzedPhoto,
} from './gallery-ai';
import { downloadModels, hasModels, ondeviceAvailable } from './model-store';
import {
  aiModeBlocks,
  groupSimilar,
  needsDownloadConfirm,
  rankBySimilarity,
  relevantOnly,
  topicCounts,
} from './search-rules';

/**
 * 비슷한 사진으로 묶는 유사도 기준. 폰용 최종 모델로 다시 맞춘 값
 * (다른 사진이 잘못 묶이는 비율 약 0.5/1만, 연속 촬영 99%), ai/docs/reports/ondevice-photo-ai.md
 */
export const SIMILAR_THRESHOLD = 0.92;
/** 검색 결과로 보여 주는 최대 장수 */
const SEARCH_LIMIT = 60;
/**
 * 1위 점수의 이 비율보다 덜 비슷한 사진은 검색 결과에서 뺀다. 테스트 사진 405장(11/16 폰 실측)에서
 * '바다'는 바다 사진만 남고 '메뉴판'·'음식'은 그대로 많이 남는 값. 실제 여행 앨범으로 다시 확인할 것
 */
const SEARCH_RELATIVE_MIN = 0.75;

let modelsPromise: Promise<Models> | null = null;
/** 모델은 앱에서 한 번만 연다. 실패하면 다음에 다시 연다 */
function getModels(): Promise<Models> {
  if (!modelsPromise) {
    modelsPromise = loadModels().catch((e) => {
      modelsPromise = null;
      throw e;
    });
  }
  return modelsPromise;
}

export type GalleryPhase =
  | 'idle'
  | 'blocked'
  | 'confirm-download'
  | 'downloading'
  | 'denied'
  | 'no-dates'
  | 'loading'
  | 'analyzing'
  | 'ready'
  | 'error';

export type GalleryTopicFilter = Topic | 'ALL';

/** 화면 한 칸. 비슷한 사진은 접혀 있으면 대표 한 장 + 묶인 장수로 보인다 */
export type GalleryTile = {
  photo: AnalyzedPhoto;
  groupSize: number;
  expanded: boolean;
  groupKey: string | null;
  score: number | null;
};

export type GallerySource = {
  /** 정리할 기간들(여행마다 하나, 밀리초 [after, before)). null이면 날짜가 없다 */
  ranges: readonly { after: number; before: number }[] | null;
  /** 설정의 AI 사진 분류. OFF면 쓰지 않는다. 아직 모르면 undefined */
  aiMode: 'AUTO' | 'CONFIRM' | 'OFF' | undefined;
};

export function useGalleryAi({ ranges, aiMode }: GallerySource) {
  const available = useMemo(() => ondeviceAvailable(), []);
  const [phase, setPhase] = useState<GalleryPhase>('idle');
  const [limited, setLimited] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [msPerPhoto, setMsPerPhoto] = useState<number | null>(null);
  const [photos, setPhotos] = useState<AnalyzedPhoto[]>([]);
  const [topic, setTopic] = useState<GalleryTopicFilter>('ALL');
  const [rangeFilter, setRangeFilter] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [queryVec, setQueryVec] = useState<{ q: string; v: Float32Array; ms: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const cancelled = useRef(false);
  const running = useRef(false);
  const blocked = aiModeBlocks(aiMode);

  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );

  /** 모델이 준비된 뒤: 권한 → 기간 사진 → 정리 */
  const analyze = useCallback(async () => {
    const permission = await ensureGalleryPermission();
    if (!permission.granted) {
      setPhase('denied');
      return;
    }
    setLimited(permission.limited);
    setPhase('loading');
    const t0 = Date.now();
    const m = await getModels();
    const list = await tripGalleryPhotos(ranges ?? []);
    setProgress({ done: 0, total: list.length });
    setPhase('analyzing');
    const t1 = Date.now();
    const analyzed = await analyzeGallery(
      m,
      list,
      (done, total, ms) => {
        setProgress({ done, total });
        setMsPerPhoto(ms);
      },
      () => cancelled.current,
    );
    if (cancelled.current) return;
    setPhotos(analyzed);
    setPhase('ready');
    // 폰 실측용 한 줄(logcat ReactNativeJS). 사진 내용은 남기지 않고 수와 시간만
    console.log(
      `ONDEV_RESULT ${JSON.stringify({ kind: 'gallery', photos: analyzed.length, modelLoadMs: m.loadMs, prepMs: t1 - t0, analyzeMs: Date.now() - t1 })}`,
    );
  }, [ranges]);

  const run = useCallback(
    (download: boolean) => {
      if (running.current) return;
      running.current = true;
      cancelled.current = false;
      void (async () => {
        try {
          if (download) {
            setPhase('downloading');
            await downloadModels((done, total) => setProgress({ done, total }));
          }
          await analyze();
        } catch {
          setPhase('error');
        } finally {
          running.current = false;
        }
      })();
    },
    [analyze],
  );

  /** [정리하기]. 모델이 없고 모바일 데이터면 먼저 묻는다(confirm-download → confirmDownload) */
  const start = useCallback(() => {
    if (blocked) {
      setPhase('blocked');
      return;
    }
    if (!ranges || ranges.length === 0) {
      setPhase('no-dates');
      return;
    }
    if (hasModels()) {
      run(false);
      return;
    }
    void NetInfo.fetch()
      .then((s) => s.type)
      .catch(() => null)
      .then((type) => {
        if (needsDownloadConfirm(type)) setPhase('confirm-download');
        else run(true);
      });
  }, [blocked, ranges, run]);

  // 검색어 → 벡터(입력이 멈추고 0.3초 뒤). 지우면 결과는 아래에서 바로 비운다
  useEffect(() => {
    const q = query.trim();
    if (!q || phase !== 'ready') return;
    let stop = false;
    const timer = setTimeout(() => {
      void getModels()
        .then((m) => embedText(m, q))
        .then(({ embedding, ms }) => {
          if (stop) return;
          setQueryVec({ q, v: embedding, ms });
          console.log(`ONDEV_RESULT ${JSON.stringify({ kind: 'query', ms })}`);
        })
        .catch(() => {});
    }, 300);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [query, phase]);

  const groups = useMemo(() => groupSimilar(photos, SIMILAR_THRESHOLD), [photos]);
  const inRange = useMemo(
    () => (rangeFilter === null ? photos : photos.filter((p) => p.rangeIndex === rangeFilter)),
    [photos, rangeFilter],
  );
  const counts = useMemo(() => topicCounts(inRange), [inRange]);

  const tiles = useMemo((): GalleryTile[] => {
    const inTopic = topic === 'ALL' ? inRange : inRange.filter((p) => p.topic === topic);
    const q = query.trim();
    if (q && queryVec?.q === q) {
      const byId = new Map(inTopic.map((p) => [p.id, p]));
      return relevantOnly(
        rankBySimilarity(queryVec.v, inTopic, SEARCH_LIMIT),
        SEARCH_RELATIVE_MIN,
      ).flatMap((r) => {
        const photo = byId.get(r.id);
        return photo
          ? [{ photo, groupSize: 1, expanded: false, groupKey: null, score: r.score }]
          : [];
      });
    }
    // 검색어가 없으면 찍은 순서로, 비슷한 사진은 대표 한 장으로 접는다(펼친 묶음은 모두)
    const ordered = [...inTopic].sort((a, b) => a.takenAt - b.takenAt);
    return collapseGroups(ordered, (p) => groups.get(p.id) ?? null, expanded).map((t) => ({
      photo: t.item,
      groupSize: t.groupSize,
      expanded: t.expanded,
      groupKey: t.groupKey,
      score: null,
    }));
  }, [inRange, topic, query, queryVec, groups, expanded]);

  const toggle = useCallback(
    (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );

  const toggleGroup = useCallback(
    (key: string) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );

  /** 올린 뒤 서버로 보낼 폰 분석 결과(기기 사진 id → 주제·묶음 키) */
  const resultFor = useCallback(
    (id: string) => {
      const p = photos.find((x) => x.id === id);
      return p ? { topic: p.topic, groupKey: groups.get(id) ?? null } : null;
    },
    [photos, groups],
  );

  return {
    available,
    blocked,
    phase,
    limited,
    progress,
    msPerPhoto,
    counts,
    topic,
    setTopic,
    rangeFilter,
    setRangeFilter,
    query,
    setQuery,
    queryMs: query.trim() && queryVec?.q === query.trim() ? queryVec.ms : null,
    tiles,
    selected,
    toggle,
    toggleGroup,
    clearSelection: () => setSelected(new Set()),
    selectedPhotos: () => photos.filter((p) => selected.has(p.id)),
    resultFor,
    start,
    confirmDownload: () => run(true),
    cancelDownload: () => setPhase('idle'),
  };
}

export type GalleryAi = ReturnType<typeof useGalleryAi>;
