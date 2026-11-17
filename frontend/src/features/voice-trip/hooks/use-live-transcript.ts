import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

export type LivePhase = 'idle' | 'listening' | 'paused' | 'finishing' | 'done';

/** 듣는 중인 글이 고쳐진 것인지(같은 문장), 새 문장인지. 앞 몇 글자가 같으면 같은 문장으로 본다 */
export function sameStart(prev: string, next: string): boolean {
  const a = prev.replace(/\s+/g, '');
  const b = next.replace(/\s+/g, '');
  const n = Math.min(3, a.length, b.length);
  return a.slice(0, n) === b.slice(0, n);
}

const LEVEL_COUNT = 24;

/**
 * 폰 음성인식으로 말하는 대로 글자를 보여 준다(실험).
 * 안드로이드 12 이하는 계속 듣기가 없어 한 문장이 끝나면 인식이 멈춘다. 듣는 중이면 바로 다시 시작해 이어 붙인다.
 * 녹음 파일은 만들지 않는다. 끝나면 받아쓴 글을 돌려주고, 사용자가 고친 글을 서버에 글로 보낸다.
 */
export function useLiveTranscript(maxMs: number) {
  const [phase, setPhase] = useState<LivePhase>('idle');
  const [finals, setFinals] = useState<string[]>([]);
  const [interim, setInterim] = useState('');
  const [levels, setLevels] = useState<number[]>(() => Array(LEVEL_COUNT).fill(0));
  const [elapsedMs, setElapsedMs] = useState(0);
  const phaseRef = useRef<LivePhase>('idle');
  const interimRef = useRef('');
  const finalsRef = useRef<string[]>([]);
  // 듣고 있던 시간(멈춘 동안은 빼고)
  const startedAt = useRef<number | null>(null);
  const banked = useRef(0);
  const failures = useRef(0);
  // 인식기가 지금 돌고 있는지('start'~'end')
  const active = useRef(false);
  // ✓를 누른 뒤 인식기가 마지막 말을 확정하고 끝나기를 기다린다
  const endWaiter = useRef<(() => void) | null>(null);

  const go = (next: LivePhase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const listen = useCallback(() => {
    ExpoSpeechRecognitionModule.start({
      lang: 'ko-KR',
      interimResults: true,
      continuous: true,
      maxAlternatives: 1,
      volumeChangeEventOptions: { enabled: true, intervalMillis: 120 },
      androidIntentOptions: {
        // 말이 잠깐 끊겨도 바로 끝내지 않는다(기기마다 지키는 정도가 다르다)
        EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 4000,
        EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 4000,
      },
    });
  }, []);

  const pushFinal = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    finalsRef.current = [...finalsRef.current, t];
    setFinals(finalsRef.current);
  }, []);

  const flushInterim = useCallback(() => {
    pushFinal(interimRef.current);
    interimRef.current = '';
    setInterim('');
  }, [pushFinal]);

  const start = useCallback(async (): Promise<'started' | 'denied' | 'unavailable'> => {
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) return 'denied';
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) return 'unavailable';
    finalsRef.current = [];
    setFinals([]);
    interimRef.current = '';
    setInterim('');
    banked.current = 0;
    startedAt.current = Date.now();
    setElapsedMs(0);
    failures.current = 0;
    go('listening');
    listen();
    return 'started';
  }, [listen]);

  const pause = useCallback(() => {
    if (phaseRef.current !== 'listening') return;
    if (startedAt.current) banked.current += Date.now() - startedAt.current;
    startedAt.current = null;
    go('paused');
    ExpoSpeechRecognitionModule.stop();
    setLevels(Array(LEVEL_COUNT).fill(0));
  }, []);

  const resume = useCallback(() => {
    if (phaseRef.current !== 'paused') return;
    startedAt.current = Date.now();
    failures.current = 0;
    go('listening');
    listen();
  }, [listen]);

  /**
   * 듣기를 끝내고 지금까지 받아쓴 글을 준다. 말하는 중에 누르면 바로 자르지 않고
   * 인식기가 마지막 말을 확정할 때까지(최대 2.5초) 기다린다
   */
  const finish = useCallback(async (): Promise<string> => {
    const wasListening = phaseRef.current === 'listening';
    if (wasListening && startedAt.current) {
      banked.current += Date.now() - startedAt.current;
    }
    startedAt.current = null;
    setElapsedMs(banked.current);
    if (wasListening && active.current) {
      go('finishing');
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          endWaiter.current = null;
          resolve();
        }, 2500);
        endWaiter.current = () => {
          clearTimeout(timer);
          endWaiter.current = null;
          resolve();
        };
        ExpoSpeechRecognitionModule.stop();
      });
    } else {
      ExpoSpeechRecognitionModule.stop();
    }
    flushInterim();
    go('done');
    return finalsRef.current.join(' ');
  }, [flushInterim]);

  const reset = useCallback(() => {
    go('idle');
    ExpoSpeechRecognitionModule.abort();
    finalsRef.current = [];
    setFinals([]);
    interimRef.current = '';
    setInterim('');
    banked.current = 0;
    startedAt.current = null;
    setElapsedMs(0);
  }, []);

  useSpeechRecognitionEvent('result', (e) => {
    const text = (e.results[0]?.transcript ?? '').trim();
    failures.current = 0;
    const prev = interimRef.current;
    if (e.isFinal) {
      // 확정 결과가 비어 오는 기기가 있다. 그때는 듣던 글을 그대로 남긴다
      interimRef.current = '';
      setInterim('');
      pushFinal(text || prev);
      return;
    }
    // 쉬었다 다시 말하면 인식기가 확정 없이 새 문장을 처음부터 보내는 경우가 있다(안드로이드 12).
    // 앞 글과 시작이 다르면 앞 글을 확정해 두고 새 문장을 이어 받는다
    if (prev && text && !sameStart(prev, text)) pushFinal(prev);
    interimRef.current = text;
    setInterim(text);
  });

  useSpeechRecognitionEvent('volumechange', (e) => {
    if (phaseRef.current !== 'listening') return;
    // -2~10을 0~1로
    const v = Math.max(0, Math.min(1, (e.value + 2) / 12));
    setLevels((prev) => [...prev.slice(1), v]);
  });

  useSpeechRecognitionEvent('start', () => {
    active.current = true;
  });

  useSpeechRecognitionEvent('end', () => {
    active.current = false;
    // 끝까지 확정되지 않은 말도 버리지 않는다
    flushInterim();
    if (phaseRef.current === 'listening') listen();
    endWaiter.current?.();
  });

  useSpeechRecognitionEvent('error', (e) => {
    if (phaseRef.current === 'finishing') {
      endWaiter.current?.();
      return;
    }
    if (e.error === 'not-allowed') {
      go('idle');
      return;
    }
    // 말이 없거나(no-speech) 인식기가 바쁘면 다시 듣는다. 계속 실패하면 멈춘다
    if (phaseRef.current === 'listening' && e.error !== 'aborted') {
      failures.current += 1;
      if (failures.current > 20) {
        pause();
        return;
      }
      // 'end'가 따라오지 않는 기기도 있어 잠시 뒤 아직 멈춰 있으면 다시 듣는다
      setTimeout(() => {
        if (phaseRef.current === 'listening' && !active.current) listen();
      }, 400);
    }
  });

  // 시간과 최대 길이
  useEffect(() => {
    if (phase !== 'listening') return;
    const timer = setInterval(() => {
      const ms = banked.current + (startedAt.current ? Date.now() - startedAt.current : 0);
      setElapsedMs(ms);
      if (ms >= maxMs) pause();
    }, 250);
    return () => clearInterval(timer);
  }, [phase, maxMs, pause]);

  // 앱을 벗어나면 멈춘다. 돌아와서 이어 말한다
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') pause();
    });
    return () => sub.remove();
  }, [pause]);

  // 화면을 떠나면 인식을 끝낸다
  useEffect(
    () => () => {
      phaseRef.current = 'idle';
      ExpoSpeechRecognitionModule.abort();
    },
    [],
  );

  const heard = finals.join(' ');
  const text = [heard, interim].filter(Boolean).join(' ');
  return { phase, text, heard, interim, levels, elapsedMs, start, pause, resume, finish, reset };
}
