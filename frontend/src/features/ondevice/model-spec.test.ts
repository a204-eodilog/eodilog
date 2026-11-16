import { describe, expect, it } from '@jest/globals';

import { MODEL_SPEC, MODEL_VERSION, isExpectedSize } from './model-spec';

describe('model-spec', () => {
  it('파일 크기가 정한 바이트와 같을 때만 받은 모델로 본다', () => {
    const image = MODEL_SPEC.find((m) => m.name === 'photo_image_int8.onnx')!;
    expect(isExpectedSize(image.name, image.bytes)).toBe(true);
    expect(isExpectedSize(image.name, image.bytes - 1)).toBe(false);
    expect(isExpectedSize(image.name, 0)).toBe(false);
    expect(isExpectedSize(image.name, null)).toBe(false);
  });

  it('모델 버전은 파일 이름과 크기로 정해져, 모델이 바뀌면 달라진다', () => {
    expect(MODEL_VERSION).toMatch(/^[0-9a-z]+$/);
    expect(MODEL_VERSION.length).toBeGreaterThan(4);
  });
});
