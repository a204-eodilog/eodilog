import { rememberMockUpload } from '@/lib/mock-photo';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { toApiError } from '@/api/errors';
import { createIdempotencyKeyStore } from '@/api/idempotency';

import {
  cancelAsset,
  completeAsset,
  createPhotoBatch,
  putPhoto,
  readPhoto,
  registerPhoto,
  requestUploadIntent,
} from '../api';
import { applyDeviceResults, classifyUploaded } from '../classify';
import { splitClassification, type DeviceTopicResult } from '../photo-rules';
import type { PickedPhoto, TripPhoto, UploadItem } from '../types';

/** 업로드 화면 단계. pick 고르기 / uploading 올리는 중 / failed 일부(또는 전부) 실패 / done 모두 올림 */
export type UploadPhase = 'pick' | 'uploading' | 'failed' | 'done';

/** 배치가 만료돼 새 배치가 필요한 오류 */
const BATCH_GONE = ['PHOTO_BATCH_EXPIRED', 'PHOTO_BATCH_FULL'];

/**
 * S30 업로드. 배치를 하나 만들고 사진을 한 장씩 차례로 올린다
 * (파일 자리 받기 → 서명 주소로 PUT → 완료 확인 → 여행 사진 등록).
 * 서버가 완료 처리를 한 번에 한 건만 받아서 동시에 올리지 않는다.
 * 실패한 사진만 다시 올릴 수 있고, 완료까지 끝난 사진은 다시 보내지 않고 등록만 한다.
 * 취소하면 남은 사진을 멈추고 완료 전 파일은 지운다. 이미 등록한 사진은 남는다
 */
export type PhotoUploadOptions = {
  /**
   * 폰 AI가 이미 분류한 사진(고른 목록의 key)의 결과. 있으면 그 결과를 저장하고 서버 AI 분류에는 보내지 않는다.
   * 같은 사진을 서버·폰에서 두 번 분류하면 먼저 적용된 쪽이 version을 올려 다른 쪽 적용이 409로 실패한다
   */
  deviceResultFor?: (key: string) => DeviceTopicResult | null;
};

export function usePhotoUpload(tripId: string, options: PhotoUploadOptions = {}) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<UploadPhase>('pick');
  const [items, setItems] = useState<UploadItem[]>([]);
  // 반복문이 최신 값을 읽도록 상태와 같이 둔다
  const itemsRef = useRef<UploadItem[]>([]);
  const batchRef = useRef<string | null>(null);
  const keys = useRef(createIdempotencyKeyStore()).current;
  const abortRef = useRef<AbortController | null>(null);
  /** 이번 올리기에서 등록을 마친 사진(고른 목록의 key와 함께). 다 올린 뒤 AI 주제 분류에 보낸다 */
  const registeredRef = useRef<{ key: string; photo: TripPhoto }[]>([]);
  const deviceResultRef = useRef(options.deviceResultFor);
  useEffect(() => {
    deviceResultRef.current = options.deviceResultFor;
  });

  useEffect(() => () => abortRef.current?.abort(), []);

  const patch = useCallback((index: number, next: Partial<UploadItem>) => {
    itemsRef.current = itemsRef.current.map((item, i) =>
      i === index ? { ...item, ...next } : item,
    );
    setItems(itemsRef.current);
  }, []);

  const uploadOne = useCallback(
    async (index: number, batchId: string, signal: AbortSignal) => {
      const item = itemsRef.current[index];
      let { assetId, ready } = item;
      if (!ready) {
        // 지난번에 자리만 받고 끝내지 못한 파일은 지우고 새 자리를 받는다
        if (assetId) void cancelAsset(assetId).catch(() => {});
        const body = await readPhoto(item.photo.uri);
        const intent = await requestUploadIntent({
          tripId,
          batchId,
          contentType: item.photo.contentType,
          byteSize: body.byteLength || item.photo.byteSize,
        });
        assetId = intent.assetId;
        patch(index, { assetId, ready: false });
        await putPhoto(intent, body, signal);
        if (signal.aborted) throw new Error('aborted');
        await completeAsset(assetId, signal);
        // 테스트 모드의 가짜 서버에는 사진이 올라가지 않는다. 고른 사진을 기억해 두었다가 목록에서 그대로 보여 준다
        // 기억한 주소는 테스트 모드에서 사진을 그릴 때만 쓰인다(실제 서버에서는 읽지 않는다)
        rememberMockUpload(assetId, item.photo.uri);
        ready = true;
        patch(index, { ready });
      }
      if (signal.aborted) throw new Error('aborted');
      const registered = await registerPhoto(tripId, {
        batchId,
        assetId: assetId!,
        capturedAt: item.photo.capturedAt,
      });
      patch(index, { registered: { id: registered.id, version: registered.version } });
      registeredRef.current.push({ key: item.photo.key, photo: registered });
    },
    [patch, tripId],
  );

  /**
   * 이번까지 등록을 마친 사진을 AI 주제 분류에 보낸다. 다 올렸든, 취소·화면 이탈로 멈췄든 거친다.
   * 화면은 기다리지 않고, 적용되면 사진 목록·요약만 다시 받는다(!302 리뷰: 여행 캐시 전체를 다시 받지 않는다)
   */
  const flushClassify = useCallback(() => {
    const { device, server } = splitClassification(registeredRef.current, deviceResultRef.current);
    registeredRef.current = [];
    const refresh = (applied: boolean) => {
      if (applied) void queryClient.invalidateQueries({ queryKey: ['trips', tripId, 'photos'] });
    };
    // 폰 결과는 바로 저장한다(작업을 기다리지 않음). 서버 분류는 폰 결과가 없는 사진만
    if (device.length > 0) void applyDeviceResults(tripId, device).then(refresh);
    if (server.length > 0) void classifyUploaded(tripId, server).then(refresh);
  }, [queryClient, tripId]);

  const upload = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    setPhase('uploading');

    let batchId = batchRef.current;
    if (!batchId) {
      const pending = itemsRef.current.filter((i) => i.status !== 'done');
      try {
        const batch = await createPhotoBatch(
          tripId,
          pending.length,
          keys.keyFor({ tripId, photos: pending.map((i) => i.photo.key) }),
        );
        batchId = batch.id;
        batchRef.current = batchId;
        keys.clear();
      } catch {
        if (signal.aborted) return;
        itemsRef.current.forEach((item, i) => {
          if (item.status !== 'done') patch(i, { status: 'failed' });
        });
        setPhase('failed');
        return;
      }
    }

    for (let i = 0; i < itemsRef.current.length; i += 1) {
      if (signal.aborted) return;
      if (itemsRef.current[i].status !== 'waiting') continue;
      patch(i, { status: 'uploading' });
      try {
        await uploadOne(i, batchId, signal);
        patch(i, { status: 'done' });
      } catch (e) {
        if (signal.aborted) return;
        // 배치가 만료됐거나 꽉 찼으면 다시 시도할 때 새 배치를 만들고, 파일도 새 배치로 다시 올린다
        // (파일 자리는 배치에 묶여 있다)
        if (BATCH_GONE.includes(toApiError(e).code ?? '')) {
          batchRef.current = null;
          patch(i, { status: 'failed', ready: false });
        } else {
          patch(i, { status: 'failed' });
        }
      }
    }

    void queryClient.invalidateQueries({ queryKey: ['trips', tripId, 'photos'] });
    setPhase(itemsRef.current.some((i) => i.status === 'failed') ? 'failed' : 'done');
  }, [keys, patch, queryClient, tripId, uploadOne]);

  const run = useCallback(async () => {
    try {
      await upload();
    } finally {
      flushClassify();
    }
  }, [flushClassify, upload]);

  /** 고른 사진으로 올리기 시작 */
  const start = useCallback(
    (photos: PickedPhoto[]) => {
      if (photos.length === 0) return;
      itemsRef.current = photos.map((photo) => ({
        photo,
        status: 'waiting',
        assetId: null,
        ready: false,
      }));
      setItems(itemsRef.current);
      batchRef.current = null;
      // 지난번 사진이 오래된 version으로 이번 분류에 섞이지 않게 비운다
      registeredRef.current = [];
      void run();
    },
    [run],
  );

  /** 실패한 사진만 다시 올리기 */
  const retryFailed = useCallback(() => {
    itemsRef.current = itemsRef.current.map((item) =>
      item.status === 'failed' ? { ...item, status: 'waiting' } : item,
    );
    setItems(itemsRef.current);
    void run();
  }, [run]);

  /**
   * 올리기 취소. 남은 사진을 멈추고, 완료 전 파일은 지운다(실패해도 서버가 기한 뒤 정리한다).
   * 이미 등록한 사진은 남는다. 올라간 장 수를 돌려준다
   */
  const cancel = useCallback(() => {
    abortRef.current?.abort();
    for (const item of itemsRef.current) {
      if (item.assetId && !item.ready) void cancelAsset(item.assetId).catch(() => {});
    }
    void queryClient.invalidateQueries({ queryKey: ['trips', tripId, 'photos'] });
    return itemsRef.current.filter((i) => i.status === 'done').length;
  }, [queryClient, tripId]);

  return { phase, items, start, retryFailed, cancel };
}
