import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BottomSheet, Button, Icon, TextField } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { formatClock } from '@/lib/voice-recording';
import { colors, radius, spacing, typography } from '@/theme';

import { postFix, VoiceTripError } from '../api';
import { deleteRecording, useLongRecorder } from '../hooks/use-long-recorder';
import type { FixResult, TripVoiceDraft } from '../voice-trip-rules';

const MAX_MS = 60_000;

type Props = {
  visible: boolean;
  draft: TripVoiceDraft;
  onClose: () => void;
  /** 받은 명령을 초안에 바로 적용한다(뒤 화면이 파랗게 바뀐다) */
  onApply: (result: FixResult) => void;
  /** 적용한 것을 되돌린다 */
  onRevert: () => void;
};

type Step = 'input' | 'sending' | 'result';

/**
 * 말로 고치기. 부르는 쪽이 열 때만 그린다(닫으면 녹음·입력이 모두 사라진다). 짧게 한 번 더 말하면(또는 적으면) 바뀐 것만 보여 주고 바로 적용한다.
 * 마음에 안 들면 [되돌리기]
 */
export function FixSheet({ visible, draft, onClose, onApply, onRevert }: Props) {
  const rec = useLongRecorder(MAX_MS);
  const [step, setStep] = useState<Step>('input');
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [result, setResult] = useState<FixResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null);
    let input: { audioUri?: string; text?: string };
    let uri: string | null = null;
    if (typing) {
      if (!text.trim()) return;
      input = { text: text.trim() };
    } else {
      uri = await rec.finish();
      if (!uri) return;
      input = { audioUri: uri };
    }
    setStep('sending');
    try {
      const got = await postFix(draft, input);
      setResult(got);
      if (got.ops.length > 0) onApply(got);
      setStep('result');
    } catch (e) {
      setError(e instanceof VoiceTripError ? e.message : '고치지 못했어요. 다시 말해 주세요');
      setStep('input');
    } finally {
      deleteRecording(uri);
      await rec.reset();
    }
  };

  const again = () => {
    setResult(null);
    setText('');
    setStep('input');
  };

  const recording = rec.phase === 'recording';

  return (
    <BottomSheet
      visible={visible}
      onClose={step === 'result' ? onClose : () => void rec.reset().then(onClose)}
      locked={step === 'sending'}
      title={step === 'result' ? '이렇게 바꿨어요' : '고칠 것을 말해 주세요'}
      titleVariant="title3"
      footer={
        step === 'result' ? (
          <View style={styles.row}>
            {result && result.ops.length > 0 ? (
              <View style={styles.flex}>
                <Button
                  label="되돌리기"
                  variant="neutral"
                  size="lg"
                  block
                  onPress={() => {
                    onRevert();
                    onClose();
                  }}
                />
              </View>
            ) : (
              <View style={styles.flex}>
                <Button label="다시 말하기" variant="neutral" size="lg" block onPress={again} />
              </View>
            )}
            <View style={styles.flex}>
              <Button label="좋아요" size="lg" block onPress={onClose} />
            </View>
          </View>
        ) : null
      }
    >
      {step === 'sending' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand.primary} />
          <Text style={[typography.bodySmall, styles.sub]}>고치고 있어요</Text>
        </View>
      ) : step === 'result' && result ? (
        <View style={styles.wrap}>
          <View style={styles.quote}>
            <Text style={[typography.bodySmall, styles.quoteText]}>{`"${result.transcript}"`}</Text>
          </View>
          {result.changes.length === 0 ? (
            <Text style={[typography.body, styles.sub]}>
              바꿀 것을 찾지 못했어요. 다시 말해 주세요
            </Text>
          ) : (
            result.changes.map((c) => (
              <Text key={c} style={[typography.body, styles.change]}>
                · {c}
              </Text>
            ))
          )}
        </View>
      ) : (
        <View style={styles.wrap}>
          <Text style={[typography.caption, styles.sub]}>
            {'예: "날짜 하루 미뤄 줘", "둘째 날 점심은 남포동 밀면", "카페는 빼 줘"'}
          </Text>
          {error ? <Text style={[typography.caption, styles.error]}>{error}</Text> : null}
          {typing ? (
            <TextField
              variant="filled"
              value={text}
              onChangeText={setText}
              placeholder="고칠 것을 적어 주세요"
              returnKeyType="send"
              onSubmitEditing={() => void send()}
              maxLength={500}
              hideCount
              accessibilityLabel="고칠 것"
            />
          ) : null}
          <View style={styles.controls}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={typing ? '말로 하기' : '글로 쓰기'}
              onPress={() => {
                void rec.reset();
                setTyping((v) => !v);
              }}
              style={styles.side}
            >
              <Icon name={typing ? 'mic' : 'pencil'} size={20} color={colors.text.icon} />
            </PressableScale>
            {typing ? (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="보내기"
                onPress={() => void send()}
                style={styles.mic}
              >
                <Icon name="send" size={28} color={colors.text.inverse} />
              </PressableScale>
            ) : (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={recording ? '다 말했어요' : '말하기'}
                onPress={() => (recording ? void send() : void rec.start())}
                style={[styles.mic, recording && styles.micOn]}
              >
                <Icon name={recording ? 'check' : 'mic'} size={30} color={colors.text.inverse} />
              </PressableScale>
            )}
            <Text style={[typography.captionBold, styles.clock]}>
              {recording ? formatClock(rec.durationMs) : ''}
            </Text>
          </View>
          <Text style={[typography.caption, styles.hint]}>
            {typing ? '' : recording ? '다 말했으면 ✓를 눌러요' : '마이크를 누르고 말해요'}
          </Text>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing[8] },
  wrap: { gap: spacing[10], paddingBottom: spacing[8] },
  center: { alignItems: 'center', gap: spacing[10], paddingVertical: spacing[24] },
  sub: { color: colors.text.sub },
  error: { color: colors.status.danger },
  quote: {
    backgroundColor: colors.surface.subtle,
    borderRadius: radius.md,
    padding: spacing[12],
  },
  quoteText: { color: colors.text.default },
  change: { color: colors.text.default },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[24],
    paddingTop: spacing[8],
  },
  side: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.default,
  },
  mic: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.primary,
  },
  micOn: { backgroundColor: colors.status.dangerMid },
  clock: { width: 48, color: colors.text.sub },
  hint: { color: colors.text.sub, textAlign: 'center' },
});
