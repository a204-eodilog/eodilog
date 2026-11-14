/**
 * 네이버 지도 공유 링크를 서버가 읽을 수 있는 주소로 바꾼다.
 *
 * 왜 필요한가: 서버는 링크의 페이지를 한 번 받아 제목·설명 글만 읽는다. 네이버 지도 페이지(map.naver.com)는
 * 빈 틀만 내려주고 가게 이름은 브라우저에서 채워서, 서버가 받은 페이지에는 읽을 글이 없다("링크를 열지 못했어요").
 * 같은 가게의 모바일 페이지(m.place.naver.com/place/번호/home)에는 가게 이름이 제목으로 들어 있다(2026-11-14 확인).
 * 그래서 앱이 보내기 전에 가게 번호를 찾아 모바일 페이지 주소로 바꾼다.
 * 서버가 네이버 지도 주소를 직접 읽게 되면 이 파일은 지워도 된다. 네이버가 주소 모양을 바꾸면 번호를 못 찾고,
 * 그때는 받은 링크를 그대로 보낸다(지금과 같은 결과)
 */

/** 짧은 링크가 어디로 가는지 알아보는 데 쓰는 최대 시간 */
const RESOLVE_TIMEOUT_MS = 5000;

const SHORT_HOST = 'naver.me';
const MAP_HOSTS = ['map.naver.com', 'm.map.naver.com', 'app.map.naver.com'];

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** 네이버 지도가 공유하기로 주는 짧은 링크(naver.me/…)인지 */
export function isNaverShortLink(url: string): boolean {
  return hostOf(url) === SHORT_HOST;
}

/** 네이버 지도 페이지 주소인지(빈 틀만 내려주는 쪽) */
export function isNaverMapLink(url: string): boolean {
  const host = hostOf(url);
  return host !== null && MAP_HOSTS.includes(host);
}

/**
 * 주소나 페이지 글에서 가게 번호를 찾는다. 없으면 null.
 * - …/place/1234567…           (map.naver.com/p/entry/place/번호, …/v5/entry/place/번호)
 * - …?id=1234567, pinId=, placeId=  (공유·앱 열기 주소)
 */
export function naverPlaceId(text: string): string | null {
  const byPath = text.match(/\/place\/(\d{4,})/);
  if (byPath) return byPath[1];
  const byQuery = text.match(/[?&](?:id|pinId|placeId)=(\d{4,})/);
  return byQuery ? byQuery[1] : null;
}

/** 가게 번호로 만든, 서버가 읽을 수 있는 모바일 페이지 주소 */
export function naverPlacePage(placeId: string): string {
  return `https://m.place.naver.com/place/${placeId}/home`;
}

/** 지도 페이지 주소에 가게 번호가 있으면 모바일 페이지 주소로, 없으면 null */
export function readableNaverLink(url: string): string | null {
  if (!isNaverMapLink(url)) return null;
  const id = naverPlaceId(url);
  return id ? naverPlacePage(id) : null;
}

/**
 * [장소 찾기]로 보낼 링크. 네이버 지도 링크면 읽을 수 있는 주소로 바꾸고, 아니면 그대로 돌려준다.
 * 짧은 링크는 한 번 따라가 어디로 가는지 본다. 따라가지 못하거나 가게 번호가 없으면 받은 링크를 그대로 쓴다
 */
export async function linkToSend(url: string): Promise<string> {
  const direct = readableNaverLink(url);
  if (direct) return direct;
  if (!isNaverShortLink(url)) return url;

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), RESOLVE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: abort.signal });
    // 따라간 끝 주소에 번호가 있으면 그것으로, 없으면 받은 페이지 글에서 한 번 더 찾는다
    const landed = response.url || url;
    const id = naverPlaceId(landed) ?? naverPlaceId(await response.text());
    return id ? naverPlacePage(id) : url;
  } catch {
    return url;
  } finally {
    clearTimeout(timer);
  }
}
