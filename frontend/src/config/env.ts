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
} as const;
