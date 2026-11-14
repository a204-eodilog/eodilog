/** 장소 (docs/api-spec.md Place). 서버가 공급자 결과를 로컬에 저장한 뒤 로컬 UUID만 준다 */
export type Place = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  regionId: string | null;
  provider: string | null;
  providerPlaceId: string | null;
  source: 'PROVIDER' | 'MANUAL';
  /** 장소 사진 주소. 서버 응답에는 아직 없다(백엔드 요청). 테스트 모드의 시험 데이터만 채운다 */
  imageUrl?: string | null;
  /**
   * 지도 공급자의 분류 글(예: "음식점>중식"). 서버는 저장해 두지만 응답에는 아직 싣지 않는다(백엔드 요청).
   * 실리면 카드의 종류 아이콘이 이 값으로 정해진다(place-kind)
   */
  category?: string | null;
};

/**
 * 개인 즐겨찾기 (docs/api-spec.md Bookmark).
 * 원본 공동 피드가 지워졌거나 볼 수 없게 되면 place·sourceFeedId가 null이고 이름·위치(retainedPlace)와 내 메모만 남는다.
 * 썸네일·출처 종류(SNS·블로그·캡처)·키워드는 응답에 없다
 */
export type Bookmark = {
  place: Place | null;
  retainedPlace: { name: string; latitude: number; longitude: number };
  memo: string | null;
  sourceFeedId: string | null;
  sourceUnavailable: boolean;
  createdAt: string;
};

/** 비동기 작업 접수 (docs/api-spec.md JobRef) */
export type JobRef = { jobId: string; status: 'QUEUED'; statusUrl: string };

/** 비동기 작업 (docs/api-spec.md Job). progress는 0~100 */
export type Job = {
  id: string;
  kind: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  progress: number;
  result: unknown;
  error: { code: string; message: string } | null;
  createdAt: string;
  finishedAt: string | null;
};

/** 추출 후보. 아직 저장·방문이 아니다. 지도에서 장소를 찾지 못하면 place가 null */
export type ExtractionCandidate = {
  candidateId: string;
  name: string;
  place: Place | null;
  /** 찾은 근거. "게시물 글에서 찾았어요" */
  evidence: string;
  confidence: number | null;
};

/** 링크·캡처 장소 추출 결과 (docs/api-spec.md ExtractionResult). 작업이 끝나기 전에는 resultStatus가 null */
export type ExtractionResult = {
  job: Job;
  resultStatus: 'SUCCESS' | 'MULTIPLE_CANDIDATES' | 'NOT_FOUND' | 'FAILED' | null;
  candidates: ExtractionCandidate[];
};

/** 업로드 준비 (docs/api-spec.md UploadIntent). uploadUrl에는 API 인증 헤더를 보내지 않는다 */
export type UploadIntent = {
  assetId: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
};
