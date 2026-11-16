// 여행 기간에 찍은 내 폰 사진을 폰 AI로 정리한다(주제, 비슷한 사진, 검색용 벡터).
// 사진은 폰 밖으로 나가지 않는다. 한 번 분석한 사진은 기기 사진 id로 저장해 다시 계산하지 않는다
import { File } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Platform } from 'react-native';

import { photoContentType } from '../photo/photo-rules';
import type { PickedPhoto } from '../photo/types';
import { analyzePhoto, readCache, writeCache, type Models, type Topic } from './engine';
import { packVector } from './search-rules';

/** 한 번에 정리하는 최대 장수(여행 하나에 이보다 많으면 최근 사진부터) */
export const MAX_GALLERY_PHOTOS = 1000;
const PAGE = 200;
/** 새로 계산한 사진이 이만큼 쌓이면 저장한다. 저장은 파일 전체를 다시 쓰므로(1,000장 약 5MB) 자주 하지 않는다 */
const SAVE_EVERY = 100;

export type GalleryPhoto = {
  id: string;
  /** 어느 기간(여행)에서 찾은 사진인지. tripGalleryPhotos에 넘긴 ranges의 순서 */
  rangeIndex: number;
  uri: string;
  filename: string;
  width: number;
  height: number;
  /** 찍은 시각(밀리초) */
  takenAt: number;
};

export type AnalyzedPhoto = GalleryPhoto & { topic: Topic; f: number[] };

/**
 * 사진 읽기 권한. granted: 읽을 수 있음, limited: 사용자가 '일부 사진만' 허용(안드로이드 14+·iOS) — 허용한 사진만 보인다
 */
export async function ensureGalleryPermission(): Promise<{ granted: boolean; limited: boolean }> {
  let res = await MediaLibrary.getPermissionsAsync(false, ['photo']);
  if (!res.granted && res.canAskAgain)
    res = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
  return { granted: res.granted, limited: res.granted && res.accessPrivileges === 'limited' };
}

/** 기간들(여행마다 하나)에 찍은 폰 사진. 최근 사진부터, 겹치면 앞 기간으로, 모두 합쳐 최대 MAX_GALLERY_PHOTOS장 */
export async function tripGalleryPhotos(
  ranges: readonly { after: number; before: number }[],
): Promise<GalleryPhoto[]> {
  const out: GalleryPhoto[] = [];
  const seen = new Set<string>();
  for (const [rangeIndex, range] of ranges.entries()) {
    let after: string | undefined;
    for (;;) {
      if (out.length >= MAX_GALLERY_PHOTOS) return out;
      const page = await MediaLibrary.getAssetsAsync({
        first: PAGE,
        after,
        mediaType: MediaLibrary.MediaType.photo,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        createdAfter: range.after,
        createdBefore: range.before,
      });
      for (const a of page.assets) {
        if (seen.has(a.id) || out.length >= MAX_GALLERY_PHOTOS) continue;
        seen.add(a.id);
        out.push({
          id: a.id,
          rangeIndex,
          uri: a.uri,
          filename: a.filename,
          width: a.width,
          height: a.height,
          takenAt: a.creationTime,
        });
      }
      if (!page.hasNextPage) break;
      after = page.endCursor;
    }
  }
  return out;
}

/**
 * 사진을 차례로 정리한다. 저장해 둔 결과가 있으면 다시 계산하지 않는다.
 * onProgress(정리한 장수, 전체, 이번에 새로 계산한 사진들의 장당 ms). 실패한 사진은 건너뛴다
 */
export async function analyzeGallery(
  m: Models,
  photos: readonly GalleryPhoto[],
  onProgress: (done: number, total: number, msPerPhoto: number | null) => void,
  isCancelled: () => boolean,
): Promise<AnalyzedPhoto[]> {
  const cache = readCache();
  const out: AnalyzedPhoto[] = [];
  let fresh = 0;
  let freshMs = 0;
  for (const p of photos) {
    if (isCancelled()) break;
    const hit = cache.get(p.id);
    if (hit) {
      out.push({ ...p, topic: hit.topic, f: hit.f });
    } else {
      try {
        const r = await analyzePhoto(m, p.uri, p.width, p.height);
        const f = packVector(r.features);
        cache.set(p.id, { id: p.id, topic: r.topic, f });
        out.push({ ...p, topic: r.topic, f });
        fresh += 1;
        freshMs += r.ms;
        if (fresh % SAVE_EVERY === 0) writeCache(cache);
      } catch {
        // 읽을 수 없는 사진(지워짐, 형식 문제)은 건너뛴다
      }
    }
    onProgress(out.length, photos.length, fresh ? Math.round(freshMs / fresh) : null);
  }
  if (fresh > 0) writeCache(cache);
  return out;
}

/** 폰 사진을 올리기 목록의 한 장으로. 형식을 받지 않거나 파일을 못 찾으면 null */
export async function toPickedPhoto(p: GalleryPhoto): Promise<PickedPhoto | null> {
  const contentType = photoContentType(null, p.filename);
  if (!contentType) return null;
  // 안드로이드는 목록의 uri가 이미 파일 주소다. getAssetInfoAsync는 안드로이드 10+에서 사진 위치 권한
  // (ACCESS_MEDIA_LOCATION)이 없으면 오류를 내서, 사진 권한만 준 사용자는 담기가 조용히 실패했다(11/16 폰 실측)
  const uri =
    Platform.OS === 'android' && p.uri.startsWith('file://')
      ? p.uri
      : await MediaLibrary.getAssetInfoAsync(p.id)
          .then((info) => info.localUri ?? p.uri)
          .catch(() => p.uri);
  let byteSize = 0;
  try {
    byteSize = new File(uri).size ?? 0;
  } catch {
    // 크기를 모르면 서버가 확인한다
  }
  return {
    key: p.id,
    uri,
    contentType,
    byteSize,
    capturedAt: Number.isFinite(p.takenAt) ? new Date(p.takenAt).toISOString() : null,
  };
}
