const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = 'CMAKE_OBJECT_PATH_MAX';

/**
 * CMake 3.31. 안드로이드 기본(3.22)은 아래 경로 상한을 줘도 긴 목적 파일 경로를 줄이지 못했다(2026-11-04 확인).
 * 이 버전이 없는 PC는 빌드할 때 안드로이드 도구가 SDK에서 내려받는다(SDK 라이선스 동의 필요).
 */
const CMAKE_VERSION = '3.31.0';

const ANDROID_SNIPPET = `
    // 윈도우 C++ 빌드 경로 260자 제한 우회(plugins/with-short-object-paths.js)
    externalNativeBuild { cmake { version "${CMAKE_VERSION}" } }`;

const DEFAULT_CONFIG_SNIPPET = `
        // 윈도우: 안드로이드 SDK의 빌드 도구(ninja 1.10)가 260자 넘는 경로를 못 다뤄
        // react-native-gesture-handler 같은 C++ 목적 파일 경로가 길면 빌드가 실패한다.
        // 경로가 이보다 길면 CMake가 짧은 이름으로 바꿔 만든다.
        externalNativeBuild { cmake { arguments "-D${MARKER}=230" } }`;

/**
 * android/app/build.gradle에 CMake 버전과 목적 파일 경로 상한을 넣는다.
 * 레포를 짧은 경로에 두어도 안 되던 Windows 빌드 실패를 막는다. 맥·리눅스에는 영향 없다.
 */
module.exports = function withShortObjectPaths(config) {
  return withAppBuildGradle(config, (c) => {
    let contents = c.modResults.contents;
    if (!contents.includes(MARKER)) {
      contents = contents
        .replace(/^android \{/m, `android {${ANDROID_SNIPPET}`)
        .replace(/defaultConfig \{/, `defaultConfig {${DEFAULT_CONFIG_SNIPPET}`);
    }
    c.modResults.contents = contents;
    return c;
  });
};
