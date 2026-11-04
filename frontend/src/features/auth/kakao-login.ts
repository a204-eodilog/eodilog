import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { DEV_MOCK_SESSION } from '@/api/dev-mock';
import type { Session } from '@/api/types';
import { env } from '@/config/env';

import { exchangeKakaoCode, requestKakaoAuthorization } from './api';
import { base64UrlFromBytes, readRedirectParams, toBase64Url } from './oauth';
import type { OAuthAuthorization } from './types';

/** 서버의 로그인 준비는 300초 뒤 만료된다. 여유를 두고 4분이 지나면 새로 준비한다 */
const PREPARED_TTL_MS = 4 * 60 * 1000;
const REDIRECT_PATH = 'oauth/kakao';

export type KakaoLoginFailure = 'config' | 'denied' | 'invalid' | 'server';

export class KakaoLoginError extends Error {
  constructor(readonly reason: KakaoLoginFailure) {
    super(`kakao login failed: ${reason}`);
  }
}

export type KakaoLoginResult = { type: 'success'; session: Session } | { type: 'cancel' };

type Prepared = {
  authorization: OAuthAuthorization;
  codeVerifier: string;
  /** 서버·카카오에 보내는 주소 */
  redirectUri: string;
  /** 브라우저가 마지막에 돌아오는 앱 주소 */
  returnUrl: string;
};

let prepared: Promise<Prepared> | null = null;
let preparedAt = 0;

function redirectUris(): { redirectUri: string; returnUrl: string } {
  if (Platform.OS === 'web') {
    const uri = `${globalThis.location.origin}/${REDIRECT_PATH}`;
    return { redirectUri: uri, returnUrl: uri };
  }
  // 카카오는 앱 주소를 받지 않는다. https 주소로 받은 뒤 eodilog://oauth/kakao로 넘겨 받아야 한다
  if (!env.kakaoRedirectUri) throw new KakaoLoginError('config');
  return { redirectUri: env.kakaoRedirectUri, returnUrl: Linking.createURL(REDIRECT_PATH) };
}

async function createPrepared(): Promise<Prepared> {
  const { redirectUri, returnUrl } = redirectUris();
  const codeVerifier = base64UrlFromBytes(Crypto.getRandomBytes(32));
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, codeVerifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  try {
    const authorization = await requestKakaoAuthorization({
      redirectUri,
      codeChallenge: toBase64Url(digest),
    });
    return { authorization, codeVerifier, redirectUri, returnUrl };
  } catch {
    throw new KakaoLoginError('server');
  }
}

/**
 * 로그인 화면에 들어오면 미리 부른다. 웹은 버튼을 누른 직후 바로 창을 열어야 브라우저가 막지 않아서,
 * 서버 준비 요청을 먼저 끝내 둔다.
 */
export function prepareKakaoLogin(): Promise<Prepared> {
  if (!prepared || Date.now() - preparedAt > PREPARED_TTL_MS) {
    preparedAt = Date.now();
    prepared = createPrepared();
    // 실패한 준비는 남겨 두지 않는다. 다음에 누르면 다시 준비한다
    prepared.catch(() => {
      prepared = null;
    });
  }
  return prepared;
}

/** 카카오 로그인 한 번. 준비 정보는 한 번만 쓸 수 있어 끝나면 비운다 */
export async function loginWithKakao(): Promise<KakaoLoginResult> {
  // 개발용 테스트 모드: 카카오를 거치지 않고 바로 로그인한 것으로 본다(src/api/dev-mock.ts)
  if (env.devMock) return { type: 'success', session: DEV_MOCK_SESSION };

  const ready = await prepareKakaoLogin();
  prepared = null;

  const result = await WebBrowser.openAuthSessionAsync(
    ready.authorization.authorizationUrl,
    ready.returnUrl,
  );
  if (result.type !== 'success') return { type: 'cancel' };

  const { code, state, error } = readRedirectParams(result.url);
  if (error) throw new KakaoLoginError('denied');
  if (!code || state !== ready.authorization.state) throw new KakaoLoginError('invalid');

  try {
    const session = await exchangeKakaoCode({
      authorizationId: ready.authorization.authorizationId,
      code,
      redirectUri: ready.redirectUri,
      state,
      codeVerifier: ready.codeVerifier,
    });
    return { type: 'success', session };
  } catch {
    throw new KakaoLoginError('server');
  }
}
