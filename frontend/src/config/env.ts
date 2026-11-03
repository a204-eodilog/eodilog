type AppEnv = 'local' | 'development' | 'preview' | 'production';

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} 환경 변수가 없습니다. frontend/.env.example을 참고해 .env를 만들어 주세요.`,
    );
  }
  return value;
}

// EXPO_PUBLIC_ 변수는 빌드 시점에 값이 그대로 들어간다. process.env.EXPO_PUBLIC_X 형태로만 읽어야 한다.
export const env = {
  appEnv: (process.env.EXPO_PUBLIC_APP_ENV ?? 'local') as AppEnv,
  apiBaseUrl: required('EXPO_PUBLIC_API_BASE_URL', process.env.EXPO_PUBLIC_API_BASE_URL),
  /**
   * 앱(안드로이드)에서 카카오 로그인 뒤 돌아올 https 주소. 카카오는 eodilog:// 같은 앱 주소를 허용하지 않아
   * 이 주소가 code·state를 eodilog://oauth/kakao로 넘겨 줘야 한다. 웹 미리보기는 비워 두면 현재 주소/oauth/kakao를 쓴다.
   */
  kakaoRedirectUri: process.env.EXPO_PUBLIC_KAKAO_REDIRECT_URI || null,
} as const;
