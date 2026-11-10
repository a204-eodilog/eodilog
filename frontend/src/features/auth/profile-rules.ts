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
