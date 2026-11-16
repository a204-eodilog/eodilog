// 웹 미리보기용 대역: onnxruntime-react-native는 불러오는 순간 폰 네이티브 모듈을 찾아서 웹에서는 화면이 깨진다.
// 웹에서는 화면 모양만 보이고, 모델을 쓰려 하면 오류를 내 검색창이 '쓰지 못했어요'로 바뀐다.
export const TOPICS = ['LANDSCAPE', 'FOOD', 'PEOPLE', 'OTHER'] as const;
export type Topic = (typeof TOPICS)[number];

export type Models = { loadMs: number; bytes: { image: number; text: number } };
export type PhotoResult = { features: Float32Array; topic: Topic; scores: number[]; ms: number };

const unsupported = () => new Error('웹 미리보기에서는 폰 AI 모델을 쓸 수 없어요');

export async function loadModels(): Promise<Models> {
  throw unsupported();
}

export async function preprocess(): Promise<Float32Array> {
  throw unsupported();
}

export async function analyzePhoto(..._args: unknown[]): Promise<PhotoResult> {
  throw unsupported();
}

export async function embedText(
  ..._args: unknown[]
): Promise<{ embedding: Float32Array; ms: number }> {
  throw unsupported();
}

export function normalize(v: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s) || 1;
  return v.map((x) => x / n);
}

export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i] * b[i];
  return s;
}

export function readCache(): Map<string, { id: string; topic: Topic; f: number[] }> {
  return new Map();
}

export function writeCache(): void {}
