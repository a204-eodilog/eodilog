import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { devMockControls } from '@/api/dev-mock';
import type { VoiceMockScenario } from '@/api/dev-mock-voice-expense';
import { Button, Chip, Header } from '@/components/ui';
import {
  type VoiceSheetState,
  VoiceRecordSheetView,
} from '@/features/expense-voice/components/voice-record-sheet-view';
import { colors, layout, spacing, typography } from '@/theme';

/**
 * 개발용 말로 경비 입력(N10·N11) 보기. 녹음 시트의 모든 상태를 그려 보고,
 * 테스트 모드 가짜 서버의 다음 분석 결과를 골라 실제 흐름(trip-1 지출 추가)으로 들어간다.
 * 앱 흐름에는 안 나오고 /dev/voice-expense로만 들어온다.
 */

const SHEET_STATES: { label: string; state: VoiceSheetState }[] = [
  { label: '권한 거부', state: { kind: 'denied' } },
  { label: '녹음 준비', state: { kind: 'ready', interrupted: false } },
  { label: '녹음 멈춤', state: { kind: 'ready', interrupted: true } },
  { label: '녹음 중', state: { kind: 'recording' } },
  { label: '녹음 끝', state: { kind: 'recorded', autoStopped: false } },
  { label: '1분 자동 종료', state: { kind: 'recorded', autoStopped: true } },
  { label: '파일 너무 큼', state: { kind: 'tooBig' } },
  { label: '보내는 중', state: { kind: 'analyzing', step: 'sending' } },
  { label: '정리하는 중', state: { kind: 'analyzing', step: 'working' } },
  { label: '보내기 실패', state: { kind: 'failed', failure: 'upload', canResend: true } },
  { label: '찾지 못함', state: { kind: 'failed', failure: 'noExpense', canResend: true } },
  { label: '다시 보내기', state: { kind: 'failed', failure: 'provider', canResend: true } },
  { label: '10건 초과', state: { kind: 'failed', failure: 'limit', canResend: true } },
  { label: '지원 안 됨', state: { kind: 'failed', failure: 'unsupported', canResend: true } },
];

const SCENARIOS: { label: string; value: VoiceMockScenario }[] = [
  { label: '기본 2건', value: 'normal' },
  { label: '확인 필요', value: 'check' },
  { label: '사람 확인', value: 'people' },
  { label: '건수 다름', value: 'count' },
  { label: '찾지 못함', value: 'VOICE_NO_SPEECH_OR_EXPENSE' },
  { label: '10건 초과', value: 'VOICE_INPUT_LIMIT_EXCEEDED' },
  { label: '지원 안 됨', value: 'VOICE_EXPENSE_UNSUPPORTED' },
  { label: '서버 문제', value: 'VOICE_PROVIDER_UNAVAILABLE' },
  { label: '파일 못 읽음', value: 'VOICE_AUDIO_INVALID' },
  { label: '보내기 실패', value: 'upload' },
];

const LEVELS = [
  0.1, 0.3, 0.5, 0.8, 0.4, 0.6, 0.9, 0.5, 0.3, 0.7, 0.85, 0.4, 0.6, 0.2, 0.75, 0.55, 0.35, 0.65,
  0.45, 0.2, 0, 0, 0, 0,
];

export default function DevVoiceExpense() {
  const [sheet, setSheet] = useState<VoiceSheetState | null>(null);
  const [scenario, setScenario] = useState<VoiceMockScenario>('normal');
  const noop = () => undefined;

  return (
    <View style={styles.screen}>
      <Header title="말로 경비 입력 (개발)" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[typography.title3, styles.text]}>N10 녹음 시트 상태</Text>
        <View style={styles.chips}>
          {SHEET_STATES.map((s) => (
            <Chip key={s.label} label={s.label} onPress={() => setSheet(s.state)} />
          ))}
        </View>

        <Text style={[typography.title3, styles.text]}>테스트 모드 다음 분석 결과</Text>
        <View style={styles.chips}>
          {SCENARIOS.map((s) => (
            <Chip
              key={s.value}
              label={s.label}
              selected={scenario === s.value}
              onPress={() => {
                setScenario(s.value);
                devMockControls.voice.next(s.value);
              }}
            />
          ))}
        </View>
        <Button
          label="다음 일괄 저장 실패시키기"
          variant="neutral"
          onPress={() => devMockControls.voice.failNextSave()}
        />
        <Button
          label="trip-1 지출 추가 열기"
          onPress={() => router.push('/trips/trip-1/expenses/new' as Href)}
        />
        <Button
          label="결과 만료 화면 열기"
          variant="neutral"
          onPress={() => router.push('/trips/trip-1/expenses/voice/voice-job-0' as Href)}
        />
        <Text style={[typography.caption, styles.sub]}>
          테스트 모드(EXPO_PUBLIC_DEV_MOCK=true)에서만 가짜 서버가 답한다. 녹음은 실제로 하고 파일은
          보내지 않는다.
        </Text>
      </ScrollView>

      <VoiceRecordSheetView
        visible={sheet !== null}
        onClose={() => setSheet(null)}
        state={sheet ?? { kind: 'ready', interrupted: false }}
        durationMs={sheet?.kind === 'recording' ? 12_000 : 18_000}
        levels={LEVELS}
        onStart={noop}
        onStop={noop}
        onCancelRecording={noop}
        onSend={noop}
        onRerecord={noop}
        onResend={noop}
        onManual={noop}
        onOpenSettings={noop}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  content: { padding: layout.screenPaddingX, gap: spacing[16] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
});
