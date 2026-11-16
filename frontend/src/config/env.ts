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
  /**
   * 동행 초대 링크를 받아 앱으로 넘겨 주는 https 주소(landing/invite). 예: https://eodilog.example.com/invite/
   * 메신저는 eodilog:// 같은 앱 주소를 누를 수 있게 만들어 주지 않아서, 공유하는 링크는 이 주소 뒤에 #토큰을 붙인다.
   * 비워 두면 앱 주소(eodilog://invitations/토큰)를 그대로 쓴다. 복사해 브라우저에 넣으면 열리지만 메신저에서는 안 눌린다
   */
  inviteUrl: process.env.EXPO_PUBLIC_INVITE_URL || null,
  /**
   * 개발용 테스트 모드. 로그인을 건너뛰고 서버 대신 src/api/dev-mock.ts의 테스트 데이터로 화면을 띄운다.
   * 로컬·개발 환경에서만 켜진다. 실제 API 연결 확인에는 쓰지 않는다.
   */
  devMock:
    process.env.EXPO_PUBLIC_DEV_MOCK === 'true' &&
    ['local', 'development'].includes(process.env.EXPO_PUBLIC_APP_ENV ?? 'local'),
  /**
   * 테스트 모드를 '신규 가입자'로 시작한다(EXPO_PUBLIC_DEV_MOCK_NEW_USER=true).
   * 처음 화면 → 로그인 → 프로필(S02) → 취향(S03) → 첫 방문 홈 순서를 서버 없이 확인한다
   */
  devMockNewUser:
    process.env.EXPO_PUBLIC_DEV_MOCK === 'true' &&
    process.env.EXPO_PUBLIC_DEV_MOCK_NEW_USER === 'true' &&
    ['local', 'development'].includes(process.env.EXPO_PUBLIC_APP_ENV ?? 'local'),
} as const;
