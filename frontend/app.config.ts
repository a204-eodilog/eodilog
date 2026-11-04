import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json 위에 .env 값이 필요한 설정만 덧붙인다. 나머지는 app.json을 그대로 쓴다.
 *
 * NAVER_MAP_CLIENT_ID: 네이버 클라우드 Maps 키. 빌드할 때 AndroidManifest에 들어간다.
 * 비워 두면 빌드는 되지만 지도가 안 뜬다(인증 실패). 키는 .env에 넣고 커밋하지 않는다.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? '어디로그',
  slug: config.slug ?? 'eodilog',
  plugins: [
    ...(config.plugins ?? []),
    './plugins/with-short-object-paths',
    [
      '@mj-studio/react-native-naver-map',
      {
        client_id: process.env.NAVER_MAP_CLIENT_ID ?? '',
        android: {
          // 내 위치 표시에 쓴다. 뒷배경 위치는 쓰지 않는다
          ACCESS_FINE_LOCATION: true,
          ACCESS_COARSE_LOCATION: true,
        },
      },
    ],
  ],
});
