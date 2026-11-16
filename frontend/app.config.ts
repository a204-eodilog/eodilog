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
    // 폰 AI 사진 정리(사진 올리기 화면): ONNX 실행과 여행 기간 사진 읽기
    'onnxruntime-react-native',
    [
      'expo-media-library',
      {
        photosPermission: '여행 기간에 찍은 사진을 폰 안에서 정리하려고 사진을 읽어요',
        savePhotosPermission: false,
        isAccessMediaLocationEnabled: false,
      },
    ],
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
