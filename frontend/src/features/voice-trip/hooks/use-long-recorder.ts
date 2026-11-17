import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { VOICE_RECORDING_OPTIONS, levelFromMetering } from '@/lib/voice-recording';

export type LongRecorderPhase = 'idle' | 'recording' | 'paused' | 'done';

const LEVEL_COUNT = 24;
const LEVEL_TICK_MS = 120;

/** 녹음 파일을 지운다 */
export function deleteRecording(uri: string | null | undefined) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // 이미 지워졌으면 그대로 둔다(앱 캐시 폴더라 기기가 정리한다)
  }
}

/** 녹음기 파일을 앱 캐시의 새 파일로 복사하고 원본은 지운다. 복사가 안 되면 원본 주소를 그대로 준다 */
function keepRecording(uri: string | null): string | null {
  if (!uri) return null;
  try {
    const target = new File(Paths.cache, `voice-trip-${Date.now()}.m4a`);
    new File(uri).copy(target);
    deleteRecording(uri);
    return target.uri;
  } catch {
    return uri;
  }
}

/**
 * 길게 말하기용 녹음(실험). 공통 useVoiceRecorder(1분, 앱을 벗어나면 버림)와 달리
 * 최대 길이를 정하고, 잠깐 멈췄다 이어 말할 수 있고, 앱을 벗어나면 버리지 않고 멈춘다.
 * 파일은 다 녹음한 뒤 uri로 넘긴다. 보낸 뒤나 화면을 떠날 때 이 훅이 지운다.
 */
export function useLongRecorder(maxMs: number) {
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const status = useAudioRecorderState(recorder, 200);
  const [phase, setPhase] = useState<LongRecorderPhase>('idle');
  const [levels, setLevels] = useState<number[]>(() => Array(LEVEL_COUNT).fill(0));
  const [lastMs, setLastMs] = useState(0);
  const phaseRef = useRef<LongRecorderPhase>('idle');
  const uriRef = useRef<string | null>(null);
  const finishing = useRef<Promise<string | null> | null>(null);

  const go = (next: LongRecorderPhase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const start = useCallback(async (): Promise<'started' | 'denied' | 'failed'> => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) return 'denied';
    deleteRecording(uriRef.current);
    uriRef.current = null;
    finishing.current = null;
    setLevels(Array(LEVEL_COUNT).fill(0));
    setLastMs(0);
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      go('recording');
      return 'started';
    } catch {
      go('idle');
      return 'failed';
    }
  }, [recorder]);

  const pause = useCallback(() => {
    if (phaseRef.current !== 'recording') return;
    recorder.pause();
    setLastMs(recorder.getStatus().durationMillis);
    go('paused');
  }, [recorder]);

  const resume = useCallback(() => {
    if (phaseRef.current !== 'paused') return;
    recorder.record();
    go('recording');
  }, [recorder]);

  /** 녹음을 끝내고 파일 주소를 준다. 실패하면 null */
  const finish = useCallback((): Promise<string | null> => {
    if (finishing.current) return finishing.current;
    if (phaseRef.current !== 'recording' && phaseRef.current !== 'paused') {
      return Promise.resolve(uriRef.current);
    }
    finishing.current = (async () => {
      setLastMs(recorder.getStatus().durationMillis);
      try {
        await recorder.stop();
        // 화면이 넘어가며 녹음기가 풀리면 녹음기 파일이 사라진다(폰에서 올리기 전에 ENOENT).
        // 올리는 동안 남아 있도록 따로 복사해 그 파일을 넘긴다
        const kept = keepRecording(recorder.uri);
        uriRef.current = kept;
        go('done');
        return kept;
      } catch {
        go('idle');
        return null;
      } finally {
        setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      }
    })();
    return finishing.current;
  }, [recorder]);

  /** 버린다 */
  const reset = useCallback(async () => {
    if (phaseRef.current === 'recording' || phaseRef.current === 'paused') {
      try {
        await recorder.stop();
      } catch {
        // 이미 멈췄으면 그대로
      }
      deleteRecording(recorder.uri);
      setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    }
    deleteRecording(uriRef.current);
    uriRef.current = null;
    finishing.current = null;
    setLastMs(0);
    go('idle');
  }, [recorder]);

  // 소리 막대와 최대 길이
  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setInterval(() => {
      if (phaseRef.current !== 'recording') return;
      const now = recorder.getStatus();
      setLevels((prev) => [...prev.slice(1), levelFromMetering(now.metering)]);
      if (now.durationMillis >= maxMs) void finish();
    }, LEVEL_TICK_MS);
    return () => clearInterval(timer);
  }, [phase, recorder, maxMs, finish]);

  // 앱을 벗어나면(전화 등) 버리지 않고 멈춘다. 돌아와서 이어 말한다
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && phaseRef.current === 'recording') pause();
    });
    return () => sub.remove();
  }, [pause]);

  // 화면을 떠나면 녹음과 파일을 정리한다
  useEffect(
    () => () => {
      if (phaseRef.current === 'recording' || phaseRef.current === 'paused') {
        recorder
          .stop()
          .catch(() => undefined)
          .finally(() => deleteRecording(recorder.uri));
      }
      setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    },
    [recorder],
  );

  const durationMs = phase === 'recording' ? status.durationMillis : lastMs;
  return { phase, levels, durationMs, start, pause, resume, finish, reset };
}
