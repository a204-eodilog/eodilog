/** 서버 규칙(docs/api-spec.md §3, PATCH /me): 앞뒤 공백을 뺀 1~50자 */
export const NICKNAME_MAX_LENGTH = 50;

/** 화면에 보이는 연령대. 아직 서버에 저장하는 API가 없어 화면에서만 고른다 */
export const AGE_BANDS = ['10대', '20대', '30대', '40대', '50대', '60대 이상'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

/** 저장할 닉네임. 규칙에 어긋나면 null */
export function normalizeNickname(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > NICKNAME_MAX_LENGTH) return null;
  return trimmed;
}
