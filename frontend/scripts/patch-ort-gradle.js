// 실험 브랜치 전용: onnxruntime-react-native 1.24.3의 android/build.gradle을 Gradle 9에 맞게 고친다.
// 1) Gradle 9에서 없어진 VersionNumber를 쓰는 RN<0.71 전용 분기를 지운다(RN 0.88에서는 항상 거짓이라 동작은 같다)
// 2) ORT 엔진(onnxruntime-android)을 latest.integration 대신 JS 패키지와 같은 1.24.3으로 고정한다
// npm postinstall은 frontend 폴더에서 돈다
const fs = require('fs');
const path = require('path');

const file = path.join(
  process.cwd(),
  'node_modules',
  'onnxruntime-react-native',
  'android',
  'build.gradle',
);
if (!fs.existsSync(file)) process.exit(0);

let src = fs.readFileSync(file, 'utf8');
const before = src;
src = src.replace(
  /\n\s*if \(VersionNumber\.parse\(REACT_NATIVE_VERSION\) < VersionNumber\.parse\("0\.71"\)\) \{[^}]*\}\n/,
  '\n',
);
src = src.replace(
  /(com\.microsoft\.onnxruntime:onnxruntime-android(?:-qnn)?):latest\.integration@aar/g,
  '$1:1.24.3@aar',
);

if (src.includes('VersionNumber') || src.includes('onnxruntime-android:latest')) {
  console.error(
    'patch-ort-gradle: 예상한 모양이 아니라 고치지 못했어요. build.gradle을 확인하세요',
  );
  process.exit(1);
}
if (src !== before) {
  fs.writeFileSync(file, src);
  console.log('patch-ort-gradle: onnxruntime-react-native build.gradle 고침');
}
