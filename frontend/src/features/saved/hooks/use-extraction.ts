import { useMutation, useQuery } from '@tanstack/react-query';

import { type CaptureFile, getExtraction, startExtraction, uploadCapture } from '../api';
import { linkLabel } from '../extract-rules';
import { rememberExtraction } from '../extract-session';

/** 진행 중 다시 읽는 간격. 값 문서 "보통 10초 안에 끝나요" */
const POLL_MS = 1500;

export const extractionKeys = { one: (jobId: string) => ['extractions', jobId] as const };

/** S12 추출 진행·결과. 작업이 끝날 때까지 1.5초마다 다시 읽는다 */
export function useExtraction(jobId: string) {
  return useQuery({
    queryKey: extractionKeys.one(jobId),
    queryFn: () => getExtraction(jobId),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.job.status;
      return status === 'QUEUED' || status === 'RUNNING' ? POLL_MS : false;
    },
  });
}

/**
 * S11 [장소 찾기]: 캡처를 모두 올리고 추출 작업을 보낸다. 작업 id를 돌려준다.
 * 한 장이라도 못 올리면 작업을 보내지 않는다(같은 캡처로 다시 누르면 처음부터 올린다)
 */
export function useStartExtraction() {
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
      const jobId = await startExtraction(body);
      rememberExtraction(jobId, {
        input: body,
        link: url ? linkLabel(url) : null,
        captureCount: captureAssetIds.length,
      });
      return jobId;
    },
  });
}

/** S12 [다시 시도]: 같은 입력(이미 올린 캡처 그대로)으로 작업을 다시 보낸다 */
export function useRetryExtraction() {
  return useMutation({
    mutationFn: async (sent: Parameters<typeof rememberExtraction>[1]) => {
      const jobId = await startExtraction(sent.input);
      rememberExtraction(jobId, sent);
      return jobId;
    },
  });
}
