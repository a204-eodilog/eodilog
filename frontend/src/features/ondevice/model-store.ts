// 폰 AI 모델 파일(약 190MB)은 앱에 넣지 않고, 처음 쓸 때 받아 앱 문서 폴더에 둔다.
// 받는 주소는 EXPO_PUBLIC_ONDEVICE_MODEL_URL(파일들이 있는 폴더 주소). 비어 있고 받아 둔 파일도 없으면 기능을 숨긴다.
import { Directory, File, Paths } from 'expo-file-system';

import { env } from '@/config/env';

/** 모델 한 벌. 이름을 바꾸면 새 모델로 보고 다시 받는다 */
export const MODEL_FILES = [
  'photo_image_int8.onnx',
  'photo_text_w4_i32.onnx',
  'head.json',
  'tokenizer.json',
] as const;

export type ModelFileName = (typeof MODEL_FILES)[number];

export function modelDir(): Directory {
  return new Directory(Paths.document, 'ondevice-models');
}

export function modelFile(name: ModelFileName): File {
  return new File(modelDir(), name);
}

/** 모델 파일이 다 있는지 */
export function hasModels(): boolean {
  try {
    return MODEL_FILES.every((name) => {
      const f = modelFile(name);
      return f.exists && (f.size ?? 0) > 0;
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
    if (!(target.exists && (target.size ?? 0) > 0)) {
      const part = new File(dir, `${name}.part`);
      if (part.exists) part.delete();
      await File.downloadFileAsync(`${base.replace(/\/+$/, '')}/${name}`, part, {
        idempotent: true,
      });
      if (target.exists) target.delete();
      part.move(target);
    }
    done += 1;
    onProgress?.(done, MODEL_FILES.length);
  }
}
