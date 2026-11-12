import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// 빌드 결과는 저장소의 landing 폴더로 간다. 서버 배포는 landing의 정적 파일을 그대로 올린다.
// landing에는 카카오 로그인 복귀 페이지(oauth/kakao)와 Jenkinsfile이 있어 폴더를 비우지 않고,
// 이름에 해시가 붙는 assets 폴더만 빌드 전에 지워 옛 파일이 쌓이지 않게 한다.
const outDir = resolve(import.meta.dirname, '../landing')

const cleanOldAssets = (): Plugin => ({
  name: 'clean-old-landing-assets',
  apply: 'build',
  buildStart() {
    rmSync(resolve(outDir, 'assets'), { recursive: true, force: true })
  },
})

export default defineConfig({
  plugins: [react(), cleanOldAssets()],
  // 기본 public 폴더 대신 static을 쓴다. 여기 둔 파일은 그대로 landing으로 복사된다
  publicDir: 'static',
  build: {
    outDir,
    emptyOutDir: false,
  },
})
