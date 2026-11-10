/**
 * 사진 기능에서 다른 기능이 쓰는 것만 내보낸다(S38 내 여행 기록의 사진 카드, S02 프로필 사진 올리기).
 * 다른 기능 폴더는 이 파일로만 불러온다(CONVENTION "다른 기능 폴더의 내부 파일을 직접 불러오지 않는다")
 */
export { completeAsset, getTripPhotos, putPhoto, readPhoto } from './api';
export { photoKeys } from './hooks/use-trip-photos';
export { photoPath } from './photo-list-rules';
export type { TripPhoto, UploadIntent } from './types';
