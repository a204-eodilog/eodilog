/** 받을 샘플 사진의 한 변(px). 목록 칸에서도 무겁지 않고 크게 보기에서도 볼 만한 크기 */
const SIZE = 600;

/** 시험 데이터의 사진 자산 id. sample-…, asset-seed-…로 시작한다 */
const SAMPLE_ASSET = /\/assets\/((?:sample|asset-seed)-[^/?]+)\/download/;

/**
 * 테스트 모드 시험 데이터의 사진 주소를 인터넷 샘플 사진 주소로 바꾼다. 시험 사진이 아니면 null.
 * 시험 데이터에는 실제 사진이 없어 사진이 들어가는 칸이 모두 빈 그림 표시로만 보였다.
 * 자산 id를 씨앗으로 써서 같은 항목은 켤 때마다 같은 사진, 다른 항목은 다른 사진이 나온다.
 * 테스트 모드에서 방금 올린 사진은 자산 id 모양이 달라 바꾸지 않는다(다른 사진이 대신 보이면 헷갈린다).
 * lib/asset-image의 assetSource가 테스트 모드일 때만 부른다
 */
export function mockPhotoUrl(path: string): string | null {
  const id = SAMPLE_ASSET.exec(path)?.[1];
  return id ? `https://picsum.photos/seed/${encodeURIComponent(id)}/${SIZE}/${SIZE}` : null;
}
