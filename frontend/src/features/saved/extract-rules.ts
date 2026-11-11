import type { ExtractionCandidate, ExtractionResult, Place } from './types';

/** 캡처는 한 번에 최대 10장(결정 Q-5a, API 명세 POST /extractions) */
export const MAX_CAPTURES = 10;

/** 캡처로 받을 수 있는 형식(API 명세: JPG/PNG) */
export const CAPTURE_TYPES = ['image/jpeg', 'image/png'] as const;

/**
 * 장소를 찾을 수 없는 파일 링크. 문서·압축·영상·음성 파일은 글이나 사진이 아니라서 추출하지 않는다.
 * 지원 사이트 목록은 아직 정해지지 않아(결정 Q-5) 웹 페이지 링크는 모두 보낸다
 */
const FILE_LINK =
  /\.(pdf|docx?|xlsx?|pptx?|hwpx?|zip|rar|7z|apk|exe|dmg|mp3|wav|m4a|mp4|mov|avi|mkv)$/i;

/** 붙여 넣은 글이 http(s) 링크인지. 앞뒤 공백은 무시한다 */
export function isLink(text: string | null | undefined): boolean {
  const value = (text ?? '').trim();
  if (!/^https?:\/\/\S+$/i.test(value)) return false;
  try {
    return Boolean(new URL(value).hostname.includes('.'));
  } catch {
    return false;
  }
}

/** 서버가 받는 링크 최대 길이(백엔드 안내 2026-11-09) */
export const MAX_LINK_LENGTH = 2048;

/**
 * 링크 칸 상태. 비었으면 empty, 웹 페이지 링크면 ok, 링크가 아니거나 파일 링크면 unsupported
 * (값 문서 "지원하지 않는 형식").
 * 서버가 400으로 거부하는 링크(계정 정보 user@ 포함, 80·443 외 포트, 2048자 초과)도 unsupported로 미리 막는다
 */
export function linkStatus(text: string): 'empty' | 'ok' | 'unsupported' {
  const value = text.trim();
  if (!value) return 'empty';
  if (value.length > MAX_LINK_LENGTH || !isLink(value)) return 'unsupported';
  const url = new URL(value);
  if (url.username || url.password) return 'unsupported';
  if (url.port && url.port !== '80' && url.port !== '443') return 'unsupported';
  return FILE_LINK.test(url.pathname) ? 'unsupported' : 'ok';
}

/** 설정에서 장소 찾기를 끈 채 보냈을 때(409 AI_FEATURE_DISABLED) 안내. 다시 시도해도 안 되므로 설정으로 보낸다 */
export const FEATURE_OFF_MESSAGE = '설정에서 "링크와 캡처에서 장소 찾기"가 꺼져 있어요';

/** [장소 찾기]를 누를 수 있는지. 링크가 맞거나 캡처가 있고, 링크 칸에 맞지 않는 글이 없어야 한다 */
export function canFind(link: string, captureCount: number): boolean {
  const status = linkStatus(link);
  if (status === 'unsupported') return false;
  return status === 'ok' || captureCount > 0;
}

/** S11을 어떤 입력으로 시작할지. S10 저장 없음의 [링크 붙여넣기]·[캡처 올리기]에서 넘긴다 */
export type AddStart = 'link' | 'capture';

/** 주소 값(?start=)을 읽는다. 모르는 값이면 보통으로 연다 */
export function parseAddStart(value: string | string[] | undefined): AddStart | null {
  const one = Array.isArray(value) ? value[0] : value;
  return one === 'link' || one === 'capture' ? one : null;
}

/**
 * S11에 링크 칸·캡처 칸 중 무엇을 보일지. 시작한 쪽은 늘 보이고, 다른 쪽은 [+ 캡처도 추가]·[+ 링크도 추가]를
 * 눌렀거나 이미 값이 있을 때만 보인다. 시작 값이 없으면(S10 [+]·S20) 링크로 시작한다
 */
export function addSections(
  begin: AddStart | null,
  state: { linkOpened: boolean; captureOpened: boolean; link: string; captureCount: number },
): { showLink: boolean; showCaptures: boolean } {
  return {
    showLink: begin !== 'capture' || state.linkOpened || state.link.length > 0,
    showCaptures: begin === 'capture' || state.captureOpened || state.captureCount > 0,
  };
}

/**
 * 고른 캡처를 더한다. 10장을 넘는 것과 JPG·PNG가 아닌 것은 빼고, 몇 장을 뺐는지 알려 준다
 */
export function addCaptures<T extends { contentType: string }>(
  current: T[],
  picked: T[],
): { captures: T[]; skippedType: number; skippedLimit: number } {
  const allowed = picked.filter((p) =>
    (CAPTURE_TYPES as readonly string[]).includes(p.contentType),
  );
  const room = Math.max(MAX_CAPTURES - current.length, 0);
  return {
    captures: [...current, ...allowed.slice(0, room)],
    skippedType: picked.length - allowed.length,
    skippedLimit: Math.max(allowed.length - room, 0),
  };
}

/** 원본 요약 칩의 링크 글자. "sns.example.com/p/8Kd2"(www·끝 / 없이, 길면 줄인다) */
export function linkLabel(url: string, max = 28): string {
  let label = url.trim();
  try {
    const u = new URL(label);
    label = `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    // 링크가 아니면 그대로 줄이기만 한다
  }
  label = label.replace(/\/$/, '');
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

/** S12 화면 상태 */
export type ExtractionView = 'progress' | 'success' | 'multiple' | 'notFound' | 'failed';

/** 묶음 안의 지도 장소 하나 */
export type GroupOption = { candidateId: string; place: Place; evidence: string };

/**
 * 게시물 속 언급 하나(같은 name)의 후보 묶음. AI 서버는 언급마다 지도 검색을 해 후보를 이어 붙여 준다
 * (ai/app/features/place_extraction/service.py). options가 0이면 지도에서 못 찾음(place: null),
 * 1이면 그 장소, 2 이상이면 같은 이름의 여러 지점이라 사용자가 고른다
 */
export type CandidateGroup = {
  /** 묶음 첫 후보 id */
  key: string;
  name: string;
  evidence: string;
  options: GroupOption[];
};

/** 후보를 언급(name)별로 묶는다. 처음 나온 순서를 지킨다 */
export function groupCandidates(candidates: ExtractionCandidate[]): CandidateGroup[] {
  const groups = new Map<string, CandidateGroup>();
  for (const c of candidates) {
    let group = groups.get(c.name);
    if (!group) {
      group = { key: c.candidateId, name: c.name, evidence: c.evidence, options: [] };
      groups.set(c.name, group);
    }
    if (c.place) {
      group.options.push({ candidateId: c.candidateId, place: c.place, evidence: c.evidence });
    }
  }
  return [...groups.values()];
}

/**
 * 추출 응답 → S12 상태. 작업이 끝나지 않았으면 진행 중, 작업 실패·취소나 결과 FAILED면 처리 실패.
 * 언급이 없으면 식별 불가. 지점을 골라야 하는 언급이 하나라도 있으면 복수 후보, 아니면 성공
 * (지도에서 못 찾은 언급은 성공 목록에 "직접 찾기" 줄로 보인다).
 * MULTIPLE_CANDIDATES는 지점이 여럿이거나 지도에서 못 찾은 언급이 있다는 뜻이라 resultStatus 대신 묶음으로 판단한다
 */
export function extractionView(result: ExtractionResult, timedOut = false): ExtractionView {
  const { job, resultStatus, candidates } = result;
  if (job.status === 'QUEUED' || job.status === 'RUNNING') return timedOut ? 'failed' : 'progress';
  if (job.status !== 'SUCCEEDED' || resultStatus === 'FAILED' || resultStatus === null) {
    return 'failed';
  }
  const groups = groupCandidates(candidates);
  if (resultStatus === 'NOT_FOUND' || groups.length === 0) return 'notFound';
  return groups.some((g) => g.options.length > 1) ? 'multiple' : 'success';
}

/** 사용자가 정한 장소. 지점을 고르거나 S13에서 직접 고른 것 */
export type GroupPick = { place: Place; evidence: string };

/** 아직 지점을 고르지 않은 첫 묶음. 없으면 null(성공 목록을 보인다) */
export function nextToChoose(
  groups: CandidateGroup[],
  picks: Record<string, GroupPick>,
  removed: string[],
): CandidateGroup | null {
  return (
    groups.find((g) => g.options.length > 1 && !picks[g.key] && !removed.includes(g.key)) ?? null
  );
}

/** 성공 목록 한 줄. place가 null이면 지도에서 못 찾아 직접 골라야 하는 줄 */
export type ExtractItem = { key: string; name: string; place: Place | null; evidence: string };

/**
 * 성공 목록. 뺀 묶음은 빼고, 정한 장소가 있으면 그것, 지점이 하나면 그 장소, 못 찾았으면 이름만.
 * 아직 고르지 않은 여러 지점 묶음은 넣지 않는다(nextToChoose로 먼저 고른다)
 */
export function extractItems(
  groups: CandidateGroup[],
  picks: Record<string, GroupPick>,
  removed: string[],
): ExtractItem[] {
  const items: ExtractItem[] = [];
  for (const g of groups) {
    if (removed.includes(g.key)) continue;
    const pick = picks[g.key];
    if (pick) {
      items.push({ key: g.key, name: pick.place.name, place: pick.place, evidence: pick.evidence });
    } else if (g.options.length === 1) {
      const [only] = g.options;
      items.push({ key: g.key, name: only.place.name, place: only.place, evidence: only.evidence });
    } else if (g.options.length === 0) {
      items.push({ key: g.key, name: g.name, place: null, evidence: g.evidence });
    }
  }
  return items;
}

/**
 * 진행 중으로 기다리는 최대 시간. 값 문서는 "보통 10초 안에 끝나요"인데 서버 제한 시간이 아직 없어서(명세 Job),
 * 그 여섯 배가 지나도 QUEUED·RUNNING이면 다시 읽기를 멈추고 처리 실패로 본다(FE 제안)
 */
export const EXTRACTION_TIMEOUT_MS = 60_000;

/** 처리 실패 안내. 보낸 입력(링크·캡처)에 맞춰 무엇을 읽지 못했는지 말한다 */
export type FailedNotice = {
  icon: 'link' | 'image' | 'alert';
  title: string;
  description: string;
};

/**
 * S12 처리 실패 안내 글. sent가 없으면(앱을 다시 켜서 보낸 입력을 잊음) 무엇을 보냈는지 몰라 일반 문구.
 * 시간 초과면 설명을 "오래 걸려요"로 바꾼다
 */
export function failedNotice(
  sent: { link: string | null; captureCount: number } | null,
  timedOut = false,
): FailedNotice {
  const description = timedOut
    ? '시간이 너무 오래 걸려요. 다시 시도해 주세요'
    : '불러오지 못했어요';
  if (!sent) return { icon: 'alert', title: '장소 찾기를 마치지 못했어요', description };
  if (sent.link && sent.captureCount > 0) {
    return { icon: 'link', title: '링크와 캡처를 읽지 못했어요', description };
  }
  if (sent.link) return { icon: 'link', title: '링크를 열지 못했어요', description };
  return { icon: 'image', title: '캡처를 읽지 못했어요', description };
}

/** 진행 단계 이름(값 문서 S12) */
export const EXTRACTION_STEPS = ['링크와 캡처 읽기', '장소 이름 찾기', '지도에 표시하기'] as const;

/**
 * 지금 단계 아래 "지금 하는 일" 한 줄(FE 제안). 첫 단계는 보낸 입력(링크·캡처 수)에 맞춘다.
 * sent가 없으면(앱을 다시 켜 보낸 입력을 잊음) 일반 문구
 */
export function stepDetail(
  step: 0 | 1 | 2,
  sent: { link: string | null; captureCount: number } | null,
): string {
  if (step === 1) return '가게 이름과 주소를 찾고 있어요';
  if (step === 2) return '찾은 곳을 지도에 올리고 있어요';
  if (sent?.link && sent.captureCount > 0) {
    return `게시물 글과 캡처 ${sent.captureCount}장을 읽고 있어요`;
  }
  if (sent?.link) return '링크 속 글을 읽고 있어요';
  if (sent && sent.captureCount > 0) return `캡처 ${sent.captureCount}장을 읽고 있어요`;
  return '보낸 내용을 읽고 있어요';
}

/** 진행 단계(값 문서: 링크와 캡처 읽기 / 장소 이름 찾기 / 지도에 표시하기). 지금 하고 있는 단계 0~2 */
export function progressStep(progress: number): 0 | 1 | 2 {
  if (progress >= 67) return 2;
  if (progress >= 34) return 1;
  return 0;
}

/** 후보 글자 A·B·C(복수 후보 핀·줄) */
export function candidateLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

/** 장소가 한 곳뿐이어도 너무 확대되지 않게 잡는 최소 범위 */
const MIN_SPAN = 0.02;

/** 장소 둘레 여유. 장소들이 차지하는 범위의 1.6배를 보여 준다 */
const PADDING = 1.6;

/**
 * S12 지도 범위. 찾은 장소들이 지도 한가운데 오게 한다.
 * 라이브러리 Region은 남서쪽 꼭짓점 + delta이고, 지도 칸과 가로세로 비율이 다르면 남서쪽에 붙여 그려
 * 핀이 한쪽으로 쏠린다. 그래서 지도 칸 비율(aspect = 너비/높이)에 맞춰 짧은 쪽 delta를 늘린다.
 * 메르카토르 지도라 경도 1도의 화면 길이는 위도 1도의 1/cos(위도)배다
 */
export function extractRegion(
  points: { latitude: number; longitude: number }[],
  aspect: number,
): {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
} | null {
  if (points.length === 0 || !(aspect > 0)) return null;
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  let latDelta = Math.max(Math.max(...lats) - Math.min(...lats), MIN_SPAN) * PADDING;
  let lngDelta = Math.max(Math.max(...lngs) - Math.min(...lngs), MIN_SPAN) * PADDING;
  // 화면에서 같은 길이일 때 경도 차이 / 위도 차이
  const ratio = aspect / Math.cos((centerLat * Math.PI) / 180);
  if (lngDelta < latDelta * ratio) lngDelta = latDelta * ratio;
  else latDelta = lngDelta / ratio;
  return {
    latitude: centerLat - latDelta / 2,
    longitude: centerLng - lngDelta / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}
