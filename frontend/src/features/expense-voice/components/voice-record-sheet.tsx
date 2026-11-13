import { getRecordingPermissionsAsync } from 'expo-audio';
import { useEffect, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text } from 'react-native';

import { Icon, toast } from '@/components/ui';
import { useVoiceRecorder } from '@/hooks/use-voice-recorder';
import { colors, radius, spacing, typography } from '@/theme';

import { useVoiceAnalysis } from '../hooks/use-voice-analysis';

import { type VoiceSheetState, VoiceRecordSheetView } from './voice-record-sheet-view';

export type VoiceRecordSheetProps = {
  tripId: string;
  visible: boolean;
  onClose: () => void;
  /** 직접 입력으로 돌아간다(시트만 닫는다) */
  onManual: () => void;
  /** 분석이 끝났다. 결과는 쿼리 캐시에 있다 → N11 */
  onDone: (jobId: string) => void;
  /** 예시 문장에 넣을 동행 이름 */
  exampleName?: string;
};

/**
 * N10 말로 경비 녹음. 녹음(공통 훅) → 보내기 → 분석 기다리기 → 결과면 N11로.
 * 시트를 닫으면 녹음·파일·기다림을 모두 정리한다(서버 작업은 취소하지 않는다).
 */
export function VoiceRecordSheet({
  tripId,
  visible,
  onClose,
  onManual,
  onDone,
  exampleName,
}: VoiceRecordSheetProps) {
  const recorder = useVoiceRecorder();
  const analysis = useVoiceAnalysis(tripId);
  const [denied, setDenied] = useState(false);

  // [설정 열기]로 가서 마이크를 켜고 돌아오면 거부 화면을 풀고 녹음 준비로 돌아간다
  useEffect(() => {
    if (!denied) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      getRecordingPermissionsAsync()
        .then((permission) => {
          if (permission.granted) setDenied(false);
        })
        .catch(() => undefined);
    });
    return () => sub.remove();
  }, [denied]);

  const cleanup = () => {
    analysis.reset();
    void recorder.cancel();
    setDenied(false);
  };

  const a = analysis.state;
  const state: VoiceSheetState = denied
    ? { kind: 'denied' }
    : a.phase === 'analyzing'
      ? { kind: 'analyzing', step: a.step }
      : a.phase === 'failed'
        ? { kind: 'failed', failure: a.failure, canResend: Boolean(recorder.clip) }
        : recorder.phase === 'recording'
          ? { kind: 'recording' }
          : recorder.phase === 'recorded' && recorder.clip
            ? recorder.clip.tooBig
              ? { kind: 'tooBig' }
              : { kind: 'recorded', autoStopped: recorder.clip.autoStopped }
            : { kind: 'ready', interrupted: recorder.interrupted };

  const send = async () => {
    const clip = recorder.clip;
    if (!clip) return;
    const jobId = await analysis.send(clip.uri);
    if (!jobId) return;
    // 결과를 받았으니 녹음 파일은 지운다
    recorder.discard();
    onDone(jobId);
  };

  return (
    <VoiceRecordSheetView
      visible={visible}
      onClose={() => {
        cleanup();
        onClose();
      }}
      state={state}
      durationMs={recorder.durationMs}
      levels={recorder.levels}
      exampleName={exampleName}
      onStart={async () => {
        const result = await recorder.start();
        if (result === 'denied') setDenied(true);
        if (result === 'failed') toast.error('녹음을 시작하지 못했어요');
      }}
      onStop={() => void recorder.stop()}
      onCancelRecording={() => void recorder.cancel()}
      onSend={() => void send()}
      onResend={() => void send()}
      onRerecord={() => {
        analysis.reset();
        void recorder.cancel();
      }}
      onManual={() => {
        cleanup();
        onManual();
      }}
      onOpenSettings={() => {
        void Linking.openSettings();
      }}
    />
  );
}

/** S35 지출 추가 상단 바 오른쪽 [🎤 말로 한 번에] */
export function VoiceEntryButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="말로 한 번에 지출 기록"
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
    >
      <Icon name="mic" size={16} color={colors.brand.primaryDark} />
      <Text style={[typography.captionMedium, styles.pillText]}>말로 한 번에</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    paddingLeft: spacing[10],
    paddingRight: spacing[12],
    paddingVertical: spacing[6],
    borderRadius: radius.full,
    backgroundColor: colors.brand.primaryBg,
  },
  pillText: { color: colors.brand.primaryDark },
  pressed: { opacity: 0.7 },
});
