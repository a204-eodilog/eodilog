import type { ImageSource } from 'expo-image';

/** 시험 데이터의 사진 자산 id. sample-…, asset-seed-…로 시작한다 */
const SAMPLE_ASSET = /\/assets\/((?:sample|asset-seed)-[^/?]+)\/download/;

/**
 * 앱 안에 넣어 둔 샘플 그림(assets/images/mock). 풍경 느낌으로 직접 만든 그림이다.
 * 전에는 인터넷 샘플 사진 사이트에서 받아 왔는데, 그 사이트가 멈추면 테스트 모드의 사진 칸이 전부 비었다.
 * 앱에 넣어 두면 인터넷 없이도 항상 나온다
 */
const SAMPLES: number[] = [
  require('@/assets/images/mock/sample-01.jpg'),
  require('@/assets/images/mock/sample-02.jpg'),
  require('@/assets/images/mock/sample-03.jpg'),
  require('@/assets/images/mock/sample-04.jpg'),
  require('@/assets/images/mock/sample-05.jpg'),
  require('@/assets/images/mock/sample-06.jpg'),
  require('@/assets/images/mock/sample-07.jpg'),
  require('@/assets/images/mock/sample-08.jpg'),
];

/** 테스트 모드에서 방금 올린 사진. 자산 id → 기기 안 사진 주소. 가짜 서버에는 사진이 올라가지 않아 고른 사진을 그대로 보인다 */
const uploaded = new Map<string, string>();

/** 테스트 모드에서 올린 사진을 기억한다. 앱을 다시 켜면 사라진다 */
export function rememberMockUpload(assetId: string, uri: string): void {
  uploaded.set(assetId, uri);
}

/** 자산 id로 샘플 그림 번호를 고른다. 같은 id는 늘 같은 번호다 */
export function sampleIndex(id: string, count: number = SAMPLES.length): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % count;
}

/**
 * 테스트 모드 시험 데이터의 사진 주소를 앱 안의 샘플 그림으로 바꾼다. 시험 사진이 아니면 null.
 * 시험 데이터에는 실제 사진이 없어 사진이 들어가는 칸이 모두 빈 그림 표시로만 보였다.
 * 자산 id로 그림을 골라서 같은 항목은 켤 때마다 같은 그림, 다른 항목은 되도록 다른 그림이 나온다.
 * 테스트 모드에서 방금 올린 사진은 고른 사진 그대로 보여 준다(rememberMockUpload). 기억해 둔 것이 없으면 바꾸지 않는다.
 * lib/asset-image의 assetSource가 테스트 모드일 때만 부른다
 */
export function mockPhotoSource(path: string): ImageSource | number | null {
  const mine = /\/assets\/([^/?]+)\/download/.exec(path)?.[1];
  const picked = mine ? uploaded.get(mine) : undefined;
  if (picked) return { uri: picked };
  const id = SAMPLE_ASSET.exec(path)?.[1];
  return id ? SAMPLES[sampleIndex(id)] : null;
}
