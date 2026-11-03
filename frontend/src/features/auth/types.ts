export type OAuthAuthorization = {
  authorizationId: string;
  /** 외부 브라우저로 여는 카카오 로그인 주소 */
  authorizationUrl: string;
  state: string;
  /** 기본 300초 뒤 만료 */
  expiresAt: string;
};

export type OAuthExchange = {
  authorizationId: string;
  code: string;
  /** 시작할 때 보낸 것과 같은 값 */
  redirectUri: string;
  state: string;
  codeVerifier: string;
};
