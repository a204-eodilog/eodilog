// 폰 AI 모델 파일(약 190MB)은 앱에 넣지 않고, 처음 쓸 때 받아 앱 문서 폴더에 둔다.
// 받는 주소는 EXPO_PUBLIC_ONDEVICE_MODEL_URL(파일들이 있는 폴더 주소). 비어 있고 받아 둔 파일도 없으면 기능을 숨긴다.
import { Directory, File, Paths } from 'expo-file-system';

import { env } from '@/config/env';

import { MODEL_SPEC, isExpectedSize, type ModelFileName } from './model-spec';

/** 모델 한 벌의 파일 이름(model-spec.ts) */
export const MODEL_FILES = MODEL_SPEC.map((m) => m.name);
export type { ModelFileName };

export function modelDir(): Directory {
  return new Directory(Paths.document, 'ondevice-models');
}

export function modelFile(name: ModelFileName): File {
  return new File(modelDir(), name);
}

/** 모델 파일이 정한 크기로 다 있는지 */
export function hasModels(): boolean {
  try {
    return MODEL_FILES.every((name) => {
      const f = modelFile(name);
      return f.exists && isExpectedSize(name, f.size);
    });
  } catch {
    return false;
  }
}

/** 이 앱에서 폰 AI를 쓸 수 있는지(받아 둔 모델이 있거나, 받을 주소가 있다) */
export function ondeviceAvailable(): boolean {
  return hasModels() || !!env.ondeviceModelUrl;
}

/**
 * 모델을 받는다. 파일마다 .part로 받은 뒤 이름을 바꿔, 중간에 끊겨도 반쪽 파일을 모델로 쓰지 않는다.
 * onProgress(받은 파일 수, 전체 파일 수)
 */
export async function downloadModels(onProgress?: (done: number, total: number) => void) {
  const base = env.ondeviceModelUrl;
  if (!base) throw new Error('모델을 받을 주소가 없어요');
  const dir = modelDir();
  if (!dir.exists) dir.create({ intermediates: true });
  let done = 0;
  onProgress?.(done, MODEL_FILES.length);
  for (const name of MODEL_FILES) {
    const target = modelFile(name);
    if (!(target.exists && isExpectedSize(name, target.size))) {
      const part = new File(dir, `${name}.part`);
      if (part.exists) part.delete();
      await File.downloadFileAsync(`${base.replace(/\/+$/, '')}/${name}`, part, {
        idempotent: true,
      });
      // 크기가 다르면(끊김, 다른 모델, 오류 페이지) 쓰지 않는다
      if (!isExpectedSize(name, part.size)) {
        part.delete();
        throw new Error(`모델 파일 크기가 달라요: ${name}`);
      }
      if (target.exists) target.delete();
      part.move(target);
    }
    done += 1;
    onProgress?.(done, MODEL_FILES.length);
  }
}
