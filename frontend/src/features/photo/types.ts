/** 기기 사진 선택창에서 고른 사진 한 장 */
export type PickedPhoto = {
  /** 고른 사진을 구분하는 값(기기 사진 id가 있으면 그것, 없으면 주소) */
  key: string;
  uri: string;
  /** image/jpeg · image/png · image/heic */
  contentType: string;
  byteSize: number;
  /** 사진 속 촬영 시각(EXIF, UTC ISO). 없으면 null */
  capturedAt: string | null;
};

/** 업로드할 때 한 장의 상태 */
export type UploadStatus = 'waiting' | 'uploading' | 'done' | 'failed';

export type UploadItem = {
  photo: PickedPhoto;
  status: UploadStatus;
  /**
   * 서버 파일 id. upload-intent를 받은 뒤 생긴다. complete까지 끝났으면 ready가 true라서
   * 다시 시도할 때 파일을 다시 올리지 않고 등록만 한다
   */
  assetId: string | null;
  ready: boolean;
  /** 등록까지 끝난 여행 사진(id·버전). 폰 AI 분류 결과를 보낼 때 쓴다 */
  registered?: { id: string; version: number } | null;
};

/** POST /trips/{tripId}/photo-upload-batches 응답 */
export type PhotoBatch = {
  id: string;
  tripId: string;
  fileCount: number;
  registeredCount: number;
  createdAt: string;
};

/** POST /assets/upload-intents 응답 */
export type UploadIntent = {
  assetId: string;
  uploadUrl: string;
  method: string;
  headers: Record<string, string>;
  expiresAt: string;
};

/** POST·GET /trips/{tripId}/photos */
export type TripPhoto = {
  id: string;
  assetId: string;
  tripId: string;
  batchId: string | null;
  uploaderMemberId: string;
  placeId: string | null;
  capturedAt: string | null;
  topics: PhotoTopic[];
  groupId: string | null;
  version: number;
};

/** 사진 주제(백엔드 topic 값) */
export type PhotoTopic = 'LANDSCAPE' | 'FOOD' | 'PEOPLE' | 'OTHER';

/** GET /trips/{tripId}/photo-summary. 목록 필터와 상관없는 전체 집계 */
export type PhotoSummary = {
  totalCount: number;
  unplacedCount: number;
  topics: { topic: PhotoTopic; count: number }[];
  places: { placeId: string; count: number }[];
};

/** 코스 장소(GET /trips/{tripId}/itinerary의 items 중 쓰는 값) */
export type CoursePlace = {
  id: string;
  /** 서버는 Place 전체를 준다. 좌표는 장소 검색(S13)을 그 근처에서 열 때 쓴다 */
  place: { id: string; name: string; latitude?: number; longitude?: number };
  day: number;
  order: number;
};
