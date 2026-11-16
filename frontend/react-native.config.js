// 실험 브랜치 전용: onnxruntime-react-native에 옛 형식 unimodule.json이 있어 Expo autolinking이
// Expo 모듈로 착각하고 RN 네이티브 모듈 목록(PackageList)에서 뺀다. android 설정을 명시해 RN 모듈로 연결되게 한다
module.exports = {
  dependencies: {
    'onnxruntime-react-native': { platforms: { android: {} } },
  },
};
