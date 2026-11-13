import { AudioQuality, IOSOutputFormat, type RecordingOptions } from 'expo-audio';

/**
 * 말로 입력에 쓰는 녹음 규격(docs/plan/voice-expense-stt-work-split-2026-11-12.md §1·§8).
 * 안드로이드·iOS 모두 M4A(AAC), 모노 44,100Hz, 64kbps로 맞춘다. 기본 프리셋은 기기마다 형식이 달라질 수 있어
 * 값을 모두 적는다. 서버도 길이·크기·형식을 다시 검사한다.
 */
export const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  // 녹음 중 소리 크기 막대를 그리려고 켠다
  isMeteringEnabled: true,
  android: {
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
    sampleRate: 44100,
  },
  ios: {
    extension: '.m4a',
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.HIGH,
    sampleRate: 44100,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
};

/** 녹음 최대 길이. 이 길이가 되면 자동으로 멈춘다 */
export const VOICE_MAX_DURATION_MS = 60_000;
/** 파일 한 개 최대 크기(10MiB). 넘으면 보내기 전에 막는다 */
export const VOICE_MAX_BYTES = 10 * 1024 * 1024;
/** 업로드할 때 쓰는 이름과 형식. 서버 계약은 audio/mp4 */
export const VOICE_UPLOAD_NAME = 'recording.m4a';
export const VOICE_UPLOAD_MIME = 'audio/mp4';

/** "0:12" 같은 분:초 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * 녹음 크기 막대 높이(0~1). metering은 dBFS(-160~0)라 말소리 범위(-50~0)를 0~1로 바꾼다.
 * 값이 없으면(웹·측정 꺼짐) 0
 */
export function levelFromMetering(db: number | undefined): number {
  if (db === undefined || Number.isNaN(db)) return 0;
  const clamped = Math.min(0, Math.max(-50, db));
  return (clamped + 50) / 50;
}
