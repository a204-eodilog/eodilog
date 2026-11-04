const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = 'CMAKE_OBJECT_PATH_MAX';
const SNIPPET = `
    // 윈도우: 안드로이드 SDK의 빌드 도구(ninja 1.10)가 260자 넘는 경로를 못 다뤄
    // react-native-gesture-handler 같은 C++ 목적 파일 경로가 길면 빌드가 실패한다.
    // 경로가 이보다 길면 CMake가 짧은 이름으로 바꿔 만든다.
    externalNativeBuild { cmake { arguments "-D${MARKER}=230" } }`;

/**
 * android/app/build.gradle의 defaultConfig에 CMake 목적 파일 경로 상한을 넣는다.
 * 레포를 짧은 경로에 두어도 안 되던 Windows 빌드 실패를 막는다. 맥·리눅스에는 영향 없다.
 */
module.exports = function withShortObjectPaths(config) {
  return withAppBuildGradle(config, (c) => {
    if (!c.modResults.contents.includes(MARKER)) {
      c.modResults.contents = c.modResults.contents.replace(
        /defaultConfig \{/,
        `defaultConfig {${SNIPPET}`,
      );
    }
    return c;
  });
};
