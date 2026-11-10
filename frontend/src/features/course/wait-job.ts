import type { JobStatus } from './types';

export class JobStopped extends Error {}

/** 화면을 나가면(abort) 기다림을 멈춘다 */
export function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new JobStopped());
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new JobStopped());
    });
  });
}

/**
 * 작업이 끝날 때까지 interval마다 묻는다. 끝난 결과를 돌려주고, timeout을 넘기면 null.
 * 자동 추천과 이동 시간 다시 계산이 같이 쓴다.
 */
export async function waitForJob<T>(
  read: (signal: AbortSignal) => Promise<T>,
  statusOf: (value: T) => JobStatus,
  signal: AbortSignal,
  { interval, timeout }: { interval: number; timeout: number },
): Promise<T | null> {
  const deadline = Date.now() + timeout;
  let value = await read(signal);
  while (statusOf(value) === 'QUEUED' || statusOf(value) === 'RUNNING') {
    if (Date.now() >= deadline) return null;
    await sleep(interval, signal);
    value = await read(signal);
  }
  return value;
}
