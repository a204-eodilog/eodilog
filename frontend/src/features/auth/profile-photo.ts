import { apiClient } from '@/api/client';
import type { DataResponse } from '@/api/types';
import { env } from '@/config/env';
import { completeAsset, type UploadIntent } from '@/features/photo';

import { type PickedPhoto, profilePhotoProblem } from './profile-rules';

/** 형식·크기가 맞지 않아 올리지 않았다. message를 그대로 보여 준다 */
export class ProfilePhotoError extends Error {}

/**
 * 받은 서명 주소로 사진 바이트를 보낸다. 서명에 content-type과 content-length가 들어 있어 보낸 바이트가
 * 그대로 가야 한다. 안드로이드에서 Blob을 바디로 넘기면 바이트가 그대로 가지 않아 저장소가 거부(403)해서
 * ArrayBuffer로 보낸다. content-length는 런타임이 바디 크기로 정하게 뺀다. 테스트 모드면 보내지 않는다
 */
async function putBytes(intent: UploadIntent, bytes: ArrayBuffer): Promise<void> {
  if (env.devMock) return;
  const headers = Object.fromEntries(
    Object.entries(intent.headers).filter(([name]) => name.toLowerCase() !== 'content-length'),
  );
  const res = await fetch(intent.uploadUrl, { method: intent.method, headers, body: bytes });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
}

/**
 * 프로필 사진을 올리고 파일 ID를 돌려준다. 자리 받기(PROFILE) → 바이트 보내기 → 완료 확인.
 * 이 ID를 `PATCH /me {profileImageAssetId}`로 보내야 프로필에 붙는다.
 * 가입 대기 토큰으로는 올릴 수 없어(PROFILE_INCOMPLETE) 닉네임을 저장한 뒤에 부른다
 */
export async function uploadProfilePhoto(photo: PickedPhoto): Promise<string> {
  const bytes = await (await fetch(photo.uri)).arrayBuffer();
  const problem = profilePhotoProblem(photo.contentType, bytes.byteLength);
  if (problem) throw new ProfilePhotoError(problem);
  const { data } = await apiClient.post<DataResponse<UploadIntent>>('/assets/upload-intents', {
    purpose: 'PROFILE',
    contentType: photo.contentType,
    byteSize: bytes.byteLength,
  });
  await putBytes(data.data, bytes);
  await completeAsset(data.data.assetId);
  return data.data.assetId;
}
