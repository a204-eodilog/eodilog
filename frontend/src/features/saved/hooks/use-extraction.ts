import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { createIdempotencyKeyStore } from '@/api/idempotency';

import { type CaptureFile, getExtraction, startExtraction, uploadCapture } from '../api';
import { EXTRACTION_TIMEOUT_MS, linkLabel } from '../extract-rules';
import { rememberExtraction } from '../extract-session';

/** 진행 중 다시 읽는 간격. 값 문서 "보통 10초 안에 끝나요" */
const POLL_MS = 1500;

export const extractionKeys = { one: (jobId: string) => ['extractions', jobId] as const };

/**
 * S12 추출 진행·결과. 작업이 끝날 때까지 1.5초마다 다시 읽는다.
 * 화면을 연 뒤 EXTRACTION_TIMEOUT_MS가 지나면 timedOut이 true가 되고 다시 읽기를 멈춘다
 * (그때도 QUEUED·RUNNING이면 화면은 처리 실패로 본다)
 */
export function useExtraction(jobId: string) {
  // 시간이 지난 작업 id. 다시 시도로 jobId가 바뀌면 새로 잰다
  const [expiredJobId, setExpiredJobId] = useState<string | null>(null);
  useEffect(() => {
    if (!jobId) return;
    const timer = setTimeout(() => setExpiredJobId(jobId), EXTRACTION_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [jobId]);
  const timedOut = expiredJobId === jobId;

  const query = useQuery({
    queryKey: extractionKeys.one(jobId),
    queryFn: () => getExtraction(jobId),
    enabled: Boolean(jobId),
    refetchInterval: (q) => {
      if (timedOut) return false;
      const status = q.state.data?.job.status;
      return status === 'QUEUED' || status === 'RUNNING' ? POLL_MS : false;
    },
  });
  return { query, timedOut };
}

/**
 * S11 [장소 찾기]: 캡처를 모두 올리고 추출 작업을 보낸다. 작업 id를 돌려준다.
 * 한 장이라도 못 올리면 작업을 보내지 않는다(같은 캡처로 다시 누르면 처음부터 올린다)
 */
export function useStartExtraction() {
  const keys = useRef(createIdempotencyKeyStore()).current;
  return useMutation({
    mutationFn: async (input: { link: string; captures: CaptureFile[]; memo: string }) => {
      const captureAssetIds = await Promise.all(input.captures.map(uploadCapture));
      const url = input.link.trim();
      const memo = input.memo.trim();
      const body = {
        ...(url ? { url } : {}),
        ...(captureAssetIds.length > 0 ? { captureAssetIds } : {}),
        ...(memo ? { memo } : {}),
      };
      const jobId = await startExtraction(body, keys.keyFor(body));
      // 접수됐으니 다음 [장소 찾기]는 같은 입력이어도 새 작업이다
      keys.clear();
      rememberExtraction(jobId, {
        input: body,
        link: url ? linkLabel(url) : null,
        captureCount: captureAssetIds.length,
      });
      return jobId;
    },
  });
}

/**
 * S12 [다시 시도]: 같은 입력(이미 올린 캡처 그대로)으로 작업을 다시 보낸다.
 * 처음 보낸 것과 본문이 같아도 다른 동작이라 새 키를 쓴다. 응답을 못 받고 다시 누르면 같은 키다
 */
export function useRetryExtraction() {
  const keys = useRef(createIdempotencyKeyStore()).current;
  return useMutation({
    mutationFn: async (sent: Parameters<typeof rememberExtraction>[1]) => {
      const jobId = await startExtraction(sent.input, keys.keyFor(sent.input));
      keys.clear();
      rememberExtraction(jobId, sent);
      return jobId;
    },
  });
}
