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
  topics: string[];
  groupId: string | null;
  version: number;
};
