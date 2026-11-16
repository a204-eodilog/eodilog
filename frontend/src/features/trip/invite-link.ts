import * as Linking from 'expo-linking';

import { env } from '@/config/env';

/**
 * 공유할 초대 링크.
 * 넘겨 주는 주소(env.inviteUrl)가 있으면 https://…/invite/#토큰 을 만든다. 메신저에서 눌리고, 그 페이지가
 * 앱 주소로 넘겨 준다. 토큰은 # 뒤에 있어 서버로 가지 않는다.
 * 없으면 이 앱이 받는 주소(eodilog://invitations/토큰)를 그대로 쓴다. 앱 주소는 카카오 로그인과 같이 expo-linking이 정한다.
 * 서버가 주는 url은 예전 앱 이름(ieohaeng://)으로 시작해 눌러도 이 앱이 열리지 않아 쓰지 않는다
 */
export function appInviteLink(token: string): string {
  const encoded = encodeURIComponent(token);
  if (env.inviteUrl) {
    // 끝에 빗금이 있든 없든 하나로 맞춘다
    const base = env.inviteUrl.endsWith('/') ? env.inviteUrl : `${env.inviteUrl}/`;
    return `${base}#${encoded}`;
  }
  return Linking.createURL(`invitations/${encoded}`);
}

/** 초대 링크 주소에서 토큰을 꺼낸다. # 뒤에 있으면 그것, 아니면 경로의 맨 끝. 주소 모양이 아니면 null */
export function inviteTokenOf(url: string): string | null {
  const hash = url.indexOf('#');
  if (hash >= 0) {
    const fragment = url.slice(hash + 1);
    return fragment ? decodeURIComponent(fragment) : null;
  }
  const path = url.split('?')[0] ?? '';
  const token = path.split('/').filter(Boolean).pop();
  // "eodilog:" 처럼 토큰이 없는 주소는 걸러 낸다
  return token && !token.endsWith(':') ? decodeURIComponent(token) : null;
}

/**
 * 이 기기에 저장해 둔 링크를 지금 쓰는 모양으로 바꾼다. 예전에 서버 url이나 앱 주소 그대로 저장한 링크도
 * 다시 만들지 않고 쓸 수 있다. 토큰을 꺼낼 수 없으면 받은 그대로 돌려준다
 */
export function toAppInviteLink(url: string): string {
  const token = inviteTokenOf(url);
  return token ? appInviteLink(token) : url;
}
