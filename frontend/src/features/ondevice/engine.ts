// 폰 안 사진 AI: 사진 분류 + 한국어 문장 사진 검색. 서버 없이 폰 CPU에서 ONNX 모델을 돌린다.
// 전처리는 서버(ai/)와 같게: EXIF 방향 → 짧은 변 256 → 가운데 256×256 → (x/255-0.5)/0.5, CHW.
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as jpeg from 'jpeg-js';
import { InferenceSession, Tensor } from 'onnxruntime-react-native';

import { modelFile } from './model-store';
import { SiglipTokenizer, type TokenizerSpec } from './siglip-tokenizer';

export const TOPICS = ['LANDSCAPE', 'FOOD', 'PEOPLE', 'OTHER'] as const;
export type Topic = (typeof TOPICS)[number];

const SIZE = 256;
const DIM = 768;

type Head = { topics: string[]; W: number[][]; B: number[]; scale: number };

export type Models = {
  image: InferenceSession;
  text: InferenceSession;
  head: Head;
  tokenizer: SiglipTokenizer;
  loadMs: number;
  bytes: { image: number; text: number };
};

/** 폰에 받아 둔 모델 파일(model-store)을 연다 */
export async function loadModels(): Promise<Models> {
  const t0 = Date.now();
  const path = (f: File) => f.uri.replace(/^file:\/\//, '');
  const imageFile = modelFile('photo_image_int8.onnx');
  const textFile = modelFile('photo_text_w4_i32.onnx');
  const image = await InferenceSession.create(path(imageFile));
  const text = await InferenceSession.create(path(textFile));
  const head = JSON.parse(modelFile('head.json').textSync()) as Head;
  const tokenizer = new SiglipTokenizer(
    JSON.parse(modelFile('tokenizer.json').textSync()) as TokenizerSpec,
  );
  return {
    image,
    text,
    head,
    tokenizer,
    loadMs: Date.now() - t0,
    bytes: { image: imageFile.size ?? 0, text: textFile.size ?? 0 },
  };
}

/** 사진 한 장을 256×256으로 줄이고 잘라 모델 입력(CHW float)으로 만든다 */
export async function preprocess(
  uri: string,
  width: number,
  height: number,
): Promise<Float32Array> {
  // 미디어 라이브러리의 가로·세로는 EXIF 회전 전 값일 수 있어, 줄인 뒤 짧은 변이 256인지 확인하고 아니면 반대 축으로 다시 줄인다
  let resized = await ImageManipulator.manipulate(uri)
    .resize(width <= height ? { width: SIZE } : { height: SIZE })
    .renderAsync();
  if (Math.min(resized.width, resized.height) !== SIZE) {
    resized = await ImageManipulator.manipulate(uri)
      .resize(resized.width < resized.height ? { width: SIZE } : { height: SIZE })
      .renderAsync();
  }
  const cropped = await ImageManipulator.manipulate(resized)
    .crop({
      originX: Math.floor((resized.width - SIZE) / 2),
      originY: Math.floor((resized.height - SIZE) / 2),
      width: SIZE,
      height: SIZE,
    })
    .renderAsync();
  // 256×256 결과를 품질 100 JPEG로 받아 jpeg-js로 푼다(재인코딩 손실은 아주 작다. 결과에 적어 둔다)
  const saved = await cropped.saveAsync({ format: SaveFormat.JPEG, compress: 1, base64: true });
  const { data } = jpeg.decode(decodeBase64(saved.base64 ?? ''), {
    useTArray: true,
    formatAsRGBA: true,
  });
  return toChw(data);
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toChw(rgba: Uint8Array): Float32Array {
  const plane = SIZE * SIZE;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    out[i] = (rgba[i * 4] / 255 - 0.5) / 0.5;
    out[plane + i] = (rgba[i * 4 + 1] / 255 - 0.5) / 0.5;
    out[2 * plane + i] = (rgba[i * 4 + 2] / 255 - 0.5) / 0.5;
  }
  return out;
}

export type PhotoResult = { features: Float32Array; topic: Topic; scores: number[]; ms: number };

export async function analyzePhoto(
  m: Models,
  uri: string,
  width: number,
  height: number,
): Promise<PhotoResult> {
  const t0 = Date.now();
  const pixels = await preprocess(uri, width, height);
  const out = await m.image.run({ pixels: new Tensor('float32', pixels, [1, 3, SIZE, SIZE]) });
  const features = normalize(out.features.data as Float32Array);
  const scores = m.head.W.map((w, k) => (dot(features, w) + m.head.B[k]) * m.head.scale);
  const best = scores.indexOf(Math.max(...scores));
  return { features, topic: m.head.topics[best] as Topic, scores, ms: Date.now() - t0 };
}

export async function embedText(
  m: Models,
  text: string,
): Promise<{ embedding: Float32Array; ms: number }> {
  const t0 = Date.now();
  const ids = Int32Array.from(m.tokenizer.encode(text));
  const out = await m.text.run({ ids32: new Tensor('int32', ids, [1, ids.length]) });
  return { embedding: normalize(out.embedding.data as Float32Array), ms: Date.now() - t0 };
}

export function normalize(v: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < DIM; i++) s += a[i] * b[i];
  return s;
}

// ── 임베딩 캐시: 다시 실행해도 같은 사진은 다시 계산하지 않는다 ──
type CacheEntry = { id: string; topic: Topic; f: number[] };
const cacheFile = () => new File(Paths.document, 'ondev-embeddings.json');

export function readCache(): Map<string, CacheEntry> {
  try {
    const f = cacheFile();
    if (!f.exists) return new Map();
    const list = JSON.parse(f.textSync()) as CacheEntry[];
    return new Map(list.map((e) => [e.id, e]));
  } catch {
    return new Map();
  }
}

export function writeCache(cache: Map<string, CacheEntry>) {
  const f = cacheFile();
  if (!f.exists) f.create();
  f.write(JSON.stringify([...cache.values()]));
}

export function clearCache() {
  const f = cacheFile();
  if (f.exists) f.delete();
}
