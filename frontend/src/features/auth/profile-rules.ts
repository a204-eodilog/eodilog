/** 서버 규칙(docs/api-spec.md §3, PATCH /me): 앞뒤 공백을 뺀 1~50자 */
export const NICKNAME_MAX_LENGTH = 50;

/** 연령대. code는 서버 값(PATCH /me의 ageBand), label은 화면 글자. 본인에게만 보인다 */
export const AGE_BANDS = [
  { code: 'TEENS', label: '10대' },
  { code: 'TWENTIES', label: '20대' },
  { code: 'THIRTIES', label: '30대' },
  { code: 'FORTIES', label: '40대' },
  { code: 'FIFTIES', label: '50대' },
  { code: 'SIXTIES_PLUS', label: '60대 이상' },
] as const;
export type AgeBand = (typeof AGE_BANDS)[number]['code'];

/** 서버 값 → 서버가 아는 연령대. 모르는 값·없음은 null */
export function toAgeBand(code: string | null | undefined): AgeBand | null {
  return AGE_BANDS.find((band) => band.code === code)?.code ?? null;
}

/** 서버 값 → 화면 글자("20대"). 모르는 값·없음은 null */
export function ageBandLabel(code: string | null | undefined): string | null {
  return AGE_BANDS.find((band) => band.code === code)?.label ?? null;
}

/** 저장할 닉네임. 규칙에 어긋나면 null */
export function normalizeNickname(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > NICKNAME_MAX_LENGTH) return null;
  return trimmed;
}

/** 서버가 받는 프로필 사진 형식(AssetPurpose.PROFILE): JPG·PNG */
const PROFILE_TYPES = ['image/jpeg', 'image/png'] as const;
/** 서버 파일 최대 크기 15MB */
export const PROFILE_MAX_BYTES = 15 * 1024 * 1024;

/** 고른 사진. uri는 기기 안 주소(미리 보기에도 쓴다) */
export type PickedPhoto = { uri: string; contentType: string };

/** 선택창이 형식을 주지 않을 때 확장자로 짐작한다 */
export function photoContentType(uri: string, mimeType?: string | null): string {
  if (mimeType) return mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  return ext ? `image/${ext}` : 'application/octet-stream';
}

/** 올릴 수 없는 이유. 올릴 수 있으면 null */
export function profilePhotoProblem(contentType: string, byteSize: number): string | null {
  if (!PROFILE_TYPES.some((type) => type === contentType)) {
    return 'JPG·PNG 사진만 넣을 수 있어요';
  }
  if (byteSize < 1) return '사진을 읽지 못했어요';
  if (byteSize > PROFILE_MAX_BYTES) return '15MB보다 작은 사진을 골라 주세요';
  return null;
}
