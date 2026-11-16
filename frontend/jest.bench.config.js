/**
 * 성능 측정용 jest 설정. `*.bench.test.*` 파일만 돌린다(기본 `npm test`에서는 빠진다).
 * 앱과 같게 React Compiler를 켜고 변환한다(기본 jest 설정은 컴파일러가 꺼져 있다).
 *   npm run bench              모든 측정
 *   npm run bench -- chat-render   하나만
 */
const preset = require('jest-expo/jest-preset');
const pkg = require('./package.json');

const transform = { ...preset.transform };
for (const [pattern, value] of Object.entries(transform)) {
  if (Array.isArray(value) && value[1]?.caller) {
    transform[pattern] = [
      value[0],
      { ...value[1], caller: { ...value[1].caller, supportsReactCompiler: true } },
    ];
  }
}

// FlashList는 ESM으로 배포돼 변환 대상에 넣는다. 측정 환경의 화면 크기는 FlashList jest 설정(400x900)을 쓴다
const transformIgnorePatterns = preset.transformIgnorePatterns.map((p) =>
  p.startsWith('/node_modules/(?!(')
    ? p.replace('/node_modules/(?!(', '/node_modules/(?!(@shopify/flash-list|')
    : p,
);

module.exports = {
  ...pkg.jest,
  transform,
  transformIgnorePatterns,
  testPathIgnorePatterns: ['/node_modules/'],
  // 측정 결과를 console.log로 보여 준다. verbose가 아니면 여러 파일을 돌릴 때 출력이 묻힌다
  verbose: true,
  testRegex: '[.]bench[.]test[.]tsx?$',
  setupFiles: [...preset.setupFiles, '@shopify/flash-list/jestSetup'],
  cacheDirectory: '<rootDir>/node_modules/.cache/jest-bench',
};
