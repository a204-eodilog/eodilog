/** 마지막 글자의 받침 번호. 한글이 아니면 null, 받침이 없으면 0, ㄹ 받침은 8 */
function finalConsonant(word: string): number | null {
  const last = word.trim().charCodeAt(word.trim().length - 1);
  if (Number.isNaN(last) || last < 0xac00 || last > 0xd7a3) return null;
  return (last - 0xac00) % 28;
}

/**
 * 단어 뒤에 '으로/로'를 붙인다. 받침이 없거나 ㄹ 받침이면 '로', 다른 받침이면 '으로'.
 * 한글로 끝나지 않으면(영문·숫자) 읽는 법을 알 수 없어 '(으)로'를 붙인다.
 * "겨울 여행" → "겨울 여행으로", "부산" → "부산으로", "제주" → "제주로", "서울" → "서울로"
 */
export function withRo(word: string): string {
  const jong = finalConsonant(word);
  if (jong === null) return `${word}(으)로`;
  return `${word}${jong === 0 || jong === 8 ? '로' : '으로'}`;
}
