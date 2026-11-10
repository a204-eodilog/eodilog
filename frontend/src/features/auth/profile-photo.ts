import { apiClient } from '@/api/client';
import type { DataResponse } from '@/api/types';
import { completeAsset, putPhoto, readPhoto, type UploadIntent } from '@/features/photo';

import { type PickedPhoto, profilePhotoProblem } from './profile-rules';

/** 형식·크기가 맞지 않아 올리지 않았다. message를 그대로 보여 준다 */
export class ProfilePhotoError extends Error {}

/**
 * 프로필 사진을 올리고 파일 ID를 돌려준다. 자리 받기(PROFILE) → 바이트 보내기 → 완료 확인.
 * 바이트 읽기·보내기는 S30 사진 올리기와 같은 함수를 쓴다(안드로이드 403 때문에 ArrayBuffer로 보냄, !199).
 * 이 ID를 `PATCH /me {profileImageAssetId}`로 보내야 프로필에 붙는다.
 * 가입 대기 토큰으로는 올릴 수 없어(PROFILE_INCOMPLETE) 닉네임을 저장한 뒤에 부른다
 */
export async function uploadProfilePhoto(photo: PickedPhoto): Promise<string> {
  const bytes = await readPhoto(photo.uri);
  const problem = profilePhotoProblem(photo.contentType, bytes.byteLength);
  if (problem) throw new ProfilePhotoError(problem);
  const { data } = await apiClient.post<DataResponse<UploadIntent>>('/assets/upload-intents', {
    purpose: 'PROFILE',
    contentType: photo.contentType,
    byteSize: bytes.byteLength,
  });
  await putPhoto(data.data, bytes);
  await completeAsset(data.data.assetId);
  return data.data.assetId;
}
