import type { ExtractionInput } from './api';

/** S11에서 보낸 입력. S12 원본 요약 칩과 [다시 시도]가 쓴다 */
export type SentExtraction = {
  input: ExtractionInput;
  /** 원본 요약 칩의 링크 글자. 링크 없이 캡처만 보냈으면 null */
  link: string | null;
  captureCount: number;
};

/**
 * 보낸 추출 입력을 작업 id별로 앱이 켜져 있는 동안만 기억한다.
 * 메모·링크를 화면 주소(라우트 값)에 싣지 않으려고 따로 둔다. 앱을 다시 켜면 비어서
 * S12는 칩 없이 결과만 보이고, [다시 시도]는 S11로 돌아간다
 */
const sent = new Map<string, SentExtraction>();

export function rememberExtraction(jobId: string, value: SentExtraction): void {
  sent.set(jobId, value);
}

export function sentExtraction(jobId: string): SentExtraction | null {
  return sent.get(jobId) ?? null;
}

export function forgetExtraction(jobId: string): void {
  sent.delete(jobId);
}
