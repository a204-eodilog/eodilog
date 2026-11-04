import type { PreferenceItem } from './types';

/**
 * 직접 쓰는 취향 한 개의 최대 글자 수와 고를 수 있는 개수.
 * 명세에 아직 정해지지 않아(Q-5) 화면에서 먼저 정한 값이다. 서버 규칙이 생기면 맞춘다
 */
export const KEYWORD_MAX_LENGTH = 20;
export const MAX_PREFERENCES = 20;

/**
 * "이런 취향은 어때요?" 추천 칩. 피그마 예시이며 Q-5 결정 후 바꾼다(디자인 결정 S03 `FE 제안`)
 */
export const SUGGESTED_KEYWORDS = ['산', '도시', '액티비티', '휴식', '사진 명소', '전통·역사'];

/** 추천 직전 화면의 고르기 칩(피그마 S03 추천 직전) */
export const QUICK_KEYWORDS = ['바다', '맛집', '카페', '산', '도시', '사진', '산책', '야경'];

/** 입력을 저장할 취향 글자로. 앞뒤 공백·겹친 공백을 정리하고, 비었거나 너무 길면 null */
export function normalizeKeyword(input: string): string | null {
  const word = input.trim().replace(/\s+/g, ' ');
  if (!word || word.length > KEYWORD_MAX_LENGTH) return null;
  return word;
}

export type AddKeywordResult =
  { ok: true; keywords: string[] } | { ok: false; reason: 'empty' | 'duplicate' | 'full' };

/** 취향을 하나 더한다. 이미 있으면(대소문자·공백 무시) 그대로, 개수가 차면 막는다 */
export function addKeyword(keywords: string[], input: string): AddKeywordResult {
  const word = normalizeKeyword(input);
  if (!word) return { ok: false, reason: 'empty' };
  const same = (a: string) => a.toLowerCase() === word.toLowerCase();
  if (keywords.some(same)) return { ok: false, reason: 'duplicate' };
  if (keywords.length >= MAX_PREFERENCES) return { ok: false, reason: 'full' };
  return { ok: true, keywords: [...keywords, word] };
}

/**
 * 서버로 보낼 직접 취향. 항목 key는 명세에 정해진 값 목록이 없어(Q-5) 글자 자체를 쓴다.
 * key가 같으면 같은 취향이다
 */
export function toExplicitItems(keywords: string[]): PreferenceItem[] {
  return keywords.map((word) => ({ key: word, value: word }));
}

/** 서버 직접 취향을 화면 글자 목록으로 */
export function fromExplicitItems(items: PreferenceItem[] | undefined): string[] {
  return (items ?? []).map((item) => item.value);
}
