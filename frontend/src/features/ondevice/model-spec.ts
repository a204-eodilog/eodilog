// 앱이 쓰는 폰 AI 모델 한 벌. 바이트 수는 ai/docs/reports/ondevice-photo-ai.md '모델 파일' 표와 같다.
// 모델을 바꾸면 여기 크기도 바꾼다. 그러면 예전 파일은 다시 받고, 예전 모델로 만든 사진 정리 결과는 버린다

export const MODEL_SPEC = [
  { name: 'photo_image_int8.onnx', bytes: 102925949 },
  { name: 'photo_text_w4_i32.onnx', bytes: 97350690 },
  { name: 'head.json', bytes: 65983 },
  { name: 'tokenizer.json', bytes: 1220249 },
] as const;

export type ModelFileName = (typeof MODEL_SPEC)[number]['name'];

/** 받은 파일이 정한 크기와 같은지. 중간에 끊긴 파일이나 다른 모델 파일을 걸러 낸다 */
export function isExpectedSize(name: ModelFileName, size: number | null | undefined): boolean {
  const spec = MODEL_SPEC.find((m) => m.name === name);
  return !!spec && size === spec.bytes;
}

/** 모델 한 벌을 가리키는 짧은 이름. 사진 정리 결과 저장 파일 이름에 붙인다 */
export const MODEL_VERSION = MODEL_SPEC.reduce(
  (h, m) => (h * 31 + m.bytes) % 2147483647,
  7,
).toString(36);
