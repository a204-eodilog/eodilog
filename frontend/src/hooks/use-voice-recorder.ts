import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  VOICE_MAX_BYTES,
  VOICE_MAX_DURATION_MS,
  VOICE_RECORDING_OPTIONS,
  levelFromMetering,
} from '@/lib/voice-recording';

/** 다 녹음한 파일 */
export type VoiceClip = {
  uri: string;
  durationMs: number;
  sizeBytes: number;
  /** 1분이 되어 저절로 멈췄다 */
  autoStopped: boolean;
  /** 10MiB를 넘어 보낼 수 없다 */
  tooBig: boolean;
};

export type VoiceRecorderPhase = 'idle' | 'recording' | 'recorded';

/** 소리 막대에 그릴 최근 값 개수 */
const LEVEL_COUNT = 24;
/** 녹음 중 상태를 읽는 간격 */
const LEVEL_TICK_MS = 120;

function deleteFile(uri: string | null | undefined) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // 이미 지워졌거나 접근할 수 없으면 그대로 둔다(앱 캐시 폴더라 기기가 정리한다)
  }
}

function fileSize(uri: string): number {
  try {
    return new File(uri).size ?? 0;
  } catch {
    return 0;
  }
}

/**
 * 말로 입력용 녹음(공통 부품). 권한 확인, 1분 자동 멈춤, 앱을 벗어나면 멈춤, 파일 정리를 맡는다.
 * 녹음 파일은 이 훅이 지운다: 다시 녹음·취소·화면을 떠날 때. 보낸 뒤 결과를 받으면 쓰는 쪽이 discard()를 부른다.
 */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const status = useAudioRecorderState(recorder, 100);
  const [phase, setPhase] = useState<VoiceRecorderPhase>('idle');
  const [clip, setClip] = useState<VoiceClip | null>(null);
  /** 전화·앱 이탈로 녹음이 멈췄다. 다시 녹음을 누르면 지운다 */
  const [interrupted, setInterrupted] = useState(false);
  const [levels, setLevels] = useState<number[]>(() => Array(LEVEL_COUNT).fill(0));
  const phaseRef = useRef<VoiceRecorderPhase>('idle');
  const clipRef = useRef<VoiceClip | null>(null);
  const stopping = useRef(false);

  const setBoth = (next: VoiceRecorderPhase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  const keepClip = (next: VoiceClip | null) => {
    clipRef.current = next;
    setClip(next);
  };

  const releaseAudioMode = () => {
    setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
  };

  /** 녹음을 멈추고 파일을 남긴다 */
  const finish = useCallback(
    async (autoStopped: boolean) => {
      if (phaseRef.current !== 'recording' || stopping.current) return;
      stopping.current = true;
      const durationMs = Math.min(recorder.getStatus().durationMillis, VOICE_MAX_DURATION_MS);
      try {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) {
          setBoth('idle');
          return;
        }
        const sizeBytes = fileSize(uri);
        keepClip({ uri, durationMs, sizeBytes, autoStopped, tooBig: sizeBytes > VOICE_MAX_BYTES });
        setBoth('recorded');
      } catch {
        setBoth('idle');
      } finally {
        // 단계가 바뀐 뒤에 푼다. 그 전에 풀면 멈추는 사이 '녹음이 끊김'으로 잘못 볼 수 있다
        stopping.current = false;
        releaseAudioMode();
      }
    },
    [recorder],
  );

  /** 녹음을 버린다. 녹음 중이면 멈추고 파일을 지운다 */
  const cancel = useCallback(
    async (markInterrupted = false) => {
      if (phaseRef.current === 'recording') {
        try {
          await recorder.stop();
        } catch {
          // 이미 멈췄으면 그대로
        }
        deleteFile(recorder.uri);
        releaseAudioMode();
      }
      deleteFile(clipRef.current?.uri);
      keepClip(null);
      setInterrupted(markInterrupted);
      setBoth('idle');
    },
    [recorder],
  );

  /** 마이크 권한을 묻고 녹음을 시작한다. 거절이면 'denied' */
  const start = useCallback(async (): Promise<'started' | 'denied' | 'failed'> => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) return 'denied';
    deleteFile(clipRef.current?.uri);
    keepClip(null);
    setInterrupted(false);
    setLevels(Array(LEVEL_COUNT).fill(0));
    try {
      // 다른 소리와 섞지 않아야 전화가 오면 녹음이 멈춘 것을 안다
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setBoth('recording');
      return 'started';
    } catch {
      releaseAudioMode();
      setBoth('idle');
      return 'failed';
    }
  }, [recorder]);

  /** 보낸 뒤 결과를 받았거나 버릴 때 파일을 지운다 */
  const discard = useCallback(() => {
    deleteFile(clipRef.current?.uri);
    keepClip(null);
    setBoth('idle');
  }, []);

  // 녹음 중에는 짧은 간격으로 상태를 읽어 소리 막대를 그리고, 1분이 되면 멈추고,
  // 녹음이 오류로 끝났으면(다른 앱이 마이크를 가져감 등) 멈춘 것으로 본다
  useEffect(() => {
    if (phase !== 'recording') return;
    let started = false;
    const timer = setInterval(() => {
      // 멈춘 직후 이 타이머가 정리되기 전에 한 번 더 돌 수 있다. 그때 '녹음이 끊김'으로 보고 방금 녹음을
      // 지우지 않도록, 녹음 중일 때만 본다
      if (phaseRef.current !== 'recording') return;
      const now = recorder.getStatus();
      if (now.isRecording) started = true;
      setLevels((prev) => [...prev.slice(1), levelFromMetering(now.metering)]);
      if (now.durationMillis >= VOICE_MAX_DURATION_MS) void finish(true);
      else if (started && !now.isRecording && !stopping.current) void cancel(true);
    }, LEVEL_TICK_MS);
    return () => clearInterval(timer);
  }, [phase, recorder, finish, cancel]);

  // 전화가 오거나 앱을 벗어나면 녹음을 멈추고 버린다(처음부터 다시 말하게 한다)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && phaseRef.current === 'recording') void cancel(true);
    });
    return () => sub.remove();
  }, [cancel]);

  // 화면을 떠나면 녹음과 파일을 정리한다
  useEffect(
    () => () => {
      if (phaseRef.current === 'recording') {
        // 녹음 중이던 파일도 멈춘 뒤 지운다(cancel과 같다)
        recorder
          .stop()
          .catch(() => undefined)
          .finally(() => deleteFile(recorder.uri));
        releaseAudioMode();
      }
      deleteFile(clipRef.current?.uri);
    },
    [recorder],
  );

  return {
    phase,
    clip,
    interrupted,
    durationMs: phase === 'recording' ? status.durationMillis : (clip?.durationMs ?? 0),
    levels,
    start,
    stop: () => finish(false),
    cancel,
    discard,
  };
}
