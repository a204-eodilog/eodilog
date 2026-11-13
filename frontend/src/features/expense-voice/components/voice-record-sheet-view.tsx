import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  BottomSheet,
  Button,
  Icon,
  type IconName,
  MascotCalculating,
  Spinner,
} from '@/components/ui';
import { VOICE_MAX_DURATION_MS, formatClock } from '@/lib/voice-recording';
import { colors, radius, spacing, typography } from '@/theme';

import type { AnalysisStep } from '../hooks/use-voice-analysis';
import { VOICE_FAILURE_TEXT, type VoiceFailure, type VoiceFailureAction } from '../voice-rules';

/**
 * N10 말로 경비 녹음 시트의 상태(docs/flow/user-flow.md 7.4, Figma "10-1. 여행 후 · 말로 경비 입력").
 * ready는 interrupted면 "녹음이 멈췄어요"(녹음 멈춤), recorded는 autoStopped면 "1분 자동 종료"
 */
export type VoiceSheetState =
  | { kind: 'denied' }
  | { kind: 'ready'; interrupted: boolean }
  | { kind: 'recording' }
  | { kind: 'recorded'; autoStopped: boolean }
  | { kind: 'tooBig' }
  | { kind: 'analyzing'; step: AnalysisStep }
  | { kind: 'failed'; failure: VoiceFailure; canResend: boolean };

export type VoiceRecordSheetViewProps = {
  visible: boolean;
  onClose: () => void;
  state: VoiceSheetState;
  durationMs: number;
  /** 녹음 중 소리 크기 막대(0~1), 오래된 것부터 */
  levels: number[];
  onStart: () => void;
  onStop: () => void;
  onCancelRecording: () => void;
  onSend: () => void;
  onRerecord: () => void;
  onResend: () => void;
  onManual: () => void;
  onOpenSettings: () => void;
  /** 예시 문장에 넣을 동행 이름. 없으면 "민지" */
  exampleName?: string;
};

/**
 * 예시 문장. 사람 수만 말하면("둘이", "셋이") 서버가 누구인지 정하지 못해 나눌 사람이 빈다
 * (2026-11-13 실제 서버 확인). 그래서 예시는 "우리 모두"나 이름으로 말한다.
 * 한눈에 읽히게 지출 하나를 한 줄로, "무엇 금액, 누가 냈고 누구랑 나눠" 순서로 맞춘다
 */
export function voiceExample(name = '민지'): string[] {
  const last = name.charCodeAt(name.length - 1);
  const batchim = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return [
    '택시비 2만 4천 원, 내가 냈고 우리 모두 나눠',
    `커피 1만 2천 원, ${name}${batchim ? '이' : '가'} 냈고 ${name}${batchim ? '이랑' : '랑'} 나랑 나눠`,
  ];
}

export function VoiceRecordSheetView(props: VoiceRecordSheetViewProps) {
  const { visible, onClose } = props;
  return (
    <BottomSheet visible={visible} onClose={onClose} title="말로 지출 기록" titleVariant="title3">
      <View style={styles.body}>{renderBody(props)}</View>
      {renderFooter(props)}
    </BottomSheet>
  );
}

function renderBody(p: VoiceRecordSheetViewProps): ReactNode {
  const s = p.state;
  switch (s.kind) {
    case 'denied':
      return (
        <View style={styles.center}>
          <Circle icon="mic-off" tone="neutral" size={64} />
          <Text style={[typography.bodyBold, styles.text]}>마이크를 쓸 수 없어요</Text>
          <Text style={[typography.body, styles.sub, styles.centerText]}>
            설정에서 마이크 권한을 켜면 말로 입력할 수 있어요
          </Text>
        </View>
      );
    case 'ready':
      return (
        <>
          {s.interrupted ? (
            <Notice
              tone="warning"
              title="녹음이 멈췄어요"
              description="전화가 오거나 앱을 벗어나면 녹음이 멈춰요. 다시 눌러 주세요"
            />
          ) : null}
          <Text style={[typography.bodyMedium, styles.text]}>
            {s.interrupted ? '처음부터 다시 말해 주세요' : '여러 지출을 한 번에 말해도 돼요'}
          </Text>
          <View style={styles.example}>
            <Text style={[typography.captionMedium, styles.sub]}>이렇게 말해 보세요</Text>
            {voiceExample(p.exampleName).map((line) => (
              <Text key={line} style={[typography.body, styles.text]}>
                “{line}”
              </Text>
            ))}
          </View>
          <View style={styles.center}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="녹음 시작"
              onPress={p.onStart}
              style={({ pressed }) => [styles.bigButton, pressed && styles.pressed]}
            >
              <Icon name="mic" size={32} color={colors.text.inverse} />
            </Pressable>
            <Text style={[typography.bodyMedium, styles.text]}>눌러서 녹음 시작</Text>
            <Text style={[typography.caption, styles.sub]}>최대 1분 · 지출 10건까지</Text>
          </View>
        </>
      );
    case 'recording':
      return (
        <View style={styles.center}>
          <View style={styles.clockRow} accessibilityLiveRegion="polite">
            <Text style={[typography.display, styles.text]}>{formatClock(p.durationMs)}</Text>
            <Text style={[typography.body, styles.sub]}>
              / {formatClock(VOICE_MAX_DURATION_MS)}
            </Text>
          </View>
          <Levels levels={p.levels} />
          <View style={styles.progress}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.min(100, (p.durationMs / VOICE_MAX_DURATION_MS) * 100)}%` },
              ]}
            />
          </View>
          <View style={styles.controls}>
            <Pressable
              accessibilityRole="button"
              onPress={p.onCancelRecording}
              hitSlop={8}
              style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
            >
              <Text style={[typography.bodyMedium, styles.sub]}>취소</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="녹음 멈추기"
              onPress={p.onStop}
              style={({ pressed }) => [styles.bigButton, pressed && styles.pressed]}
            >
              <View style={styles.stopSquare} />
            </Pressable>
            <View style={styles.textButton}>
              <Text style={[typography.bodyMedium, styles.hidden]}>취소</Text>
            </View>
          </View>
          <Text style={[typography.caption, styles.sub]}>1분이 되면 자동으로 멈춰요</Text>
        </View>
      );
    case 'recorded':
      return (
        <>
          <View style={styles.resultBox}>
            <Circle icon="mic" tone="brand" size={40} />
            <View style={styles.flex}>
              <Text style={[typography.bodyBold, styles.text]}>녹음했어요</Text>
              <Text style={[typography.caption, styles.sub]}>
                {s.autoStopped
                  ? `${formatClock(VOICE_MAX_DURATION_MS)} · 1분이 되어 자동으로 멈췄어요`
                  : formatClock(p.durationMs)}
              </Text>
            </View>
          </View>
          <Text style={[typography.caption, styles.sub]}>
            {s.autoStopped
              ? '말이 끊겼다면 다시 녹음하거나, 남은 지출은 나중에 따로 넣어 주세요'
              : '보내면 지출 초안을 만들어요. 저장은 확인한 뒤에 해요'}
          </Text>
        </>
      );
    case 'tooBig':
      return (
        <Notice
          tone="warning"
          title="녹음 파일이 너무 커요"
          description="지출을 나눠서 두 번에 말해 주세요"
        />
      );
    case 'analyzing':
      return <Steps step={s.step} />;
    case 'failed': {
      const text = VOICE_FAILURE_TEXT[s.failure];
      return <Notice tone={text.tone} title={text.title} description={text.description} />;
    }
  }
}

function renderFooter(p: VoiceRecordSheetViewProps): ReactNode {
  const s = p.state;
  const label: Record<VoiceFailureAction, string> = {
    manual: '직접 입력',
    rerecord: '다시 녹음',
    resend: '다시 보내기',
  };
  const handler: Record<VoiceFailureAction, () => void> = {
    manual: p.onManual,
    rerecord: p.onRerecord,
    resend: p.onResend,
  };
  let actions: VoiceFailureAction[] | null = null;
  if (s.kind === 'denied') {
    return (
      <Row>
        <Button
          label="직접 입력"
          variant="neutral"
          block
          onPress={p.onManual}
          style={styles.flex}
        />
        <Button label="설정 열기" block onPress={p.onOpenSettings} style={styles.flex} />
      </Row>
    );
  }
  if (s.kind === 'recorded') {
    return (
      <Row>
        <Button label="다시 녹음" variant="neutral" onPress={p.onRerecord} style={styles.flex} />
        <Button label="보내기" icon="send" block onPress={p.onSend} style={styles.flex} />
      </Row>
    );
  }
  if (s.kind === 'tooBig') actions = ['manual', 'rerecord'];
  if (s.kind === 'failed') {
    actions = VOICE_FAILURE_TEXT[s.failure].actions.filter((a) => a !== 'resend' || s.canResend);
    // 다시 보낼 파일이 없으면 다시 녹음이 주 버튼이 된다
    if (actions.length === 1 && actions[0] === 'rerecord') actions = ['manual', 'rerecord'];
  }
  if (!actions) return null;
  return (
    <Row>
      {actions.map((a, i) => (
        <Button
          key={a}
          label={label[a]}
          variant={i === actions.length - 1 ? 'primary' : 'neutral'}
          onPress={handler[a]}
          style={styles.flex}
          leading={
            a === 'rerecord' && i === actions.length - 1 ? (
              <Icon name="mic" size={20} color={colors.text.inverse} />
            ) : undefined
          }
        />
      ))}
    </Row>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

function Circle({ icon, tone, size }: { icon: IconName; tone: 'brand' | 'neutral'; size: number }) {
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size },
        tone === 'brand' ? styles.circleBrand : styles.circleNeutral,
      ]}
    >
      <Icon
        name={icon}
        size={Math.round(size * 0.45)}
        color={tone === 'brand' ? colors.brand.primaryDark : colors.text.icon}
      />
    </View>
  );
}

function Notice({
  tone,
  title,
  description,
}: {
  tone: 'warning' | 'danger';
  title: string;
  description: string;
}) {
  const warn = tone === 'warning';
  return (
    <View
      style={[styles.notice, warn ? styles.noticeWarn : styles.noticeDanger]}
      accessibilityLiveRegion="polite"
    >
      <Icon name="alert" size={22} color={warn ? colors.status.warning : colors.status.danger} />
      <View style={styles.flex}>
        <Text style={[typography.bodyBold, styles.text]}>{title}</Text>
        <Text style={[typography.caption, styles.sub]}>{description}</Text>
      </View>
    </View>
  );
}

const STEPS: { label: string; activeAt: AnalysisStep }[] = [
  { label: '녹음을 보내는 중', activeAt: 'sending' },
  { label: '차례를 기다리는 중', activeAt: 'waiting' },
  { label: '말을 지출로 정리하는 중', activeAt: 'working' },
];
const ORDER: AnalysisStep[] = ['sending', 'waiting', 'working'];

function Steps({ step }: { step: AnalysisStep }) {
  const now = ORDER.indexOf(step);
  return (
    <>
      {/* 기다리는 동안 보이는 마스코트 자리. 영수증을 보며 계산기를 두드리는 여행자(2026-11-13 사용자가 만든 동작).
          동작을 바꾸려면 assets/mascot/expense-calc.gif만 바꾼다 */}
      <View style={styles.mascot}>
        <MascotCalculating size={140} />
        <Text style={[typography.bodyMedium, styles.text]}>말한 지출을 정리하고 있어요</Text>
      </View>
      <View style={styles.steps}>
        {STEPS.map((s, i) => {
          const done = i < now;
          const active = i === now;
          return (
            <View key={s.label} style={styles.stepRow}>
              {done ? (
                <View style={[styles.circle, styles.stepDone]}>
                  <Icon name="check" size={16} color={colors.text.inverse} />
                </View>
              ) : active ? (
                <Spinner size={24} color={colors.brand.primary} />
              ) : (
                <View style={[styles.circle, styles.stepIdle]} />
              )}
              <Text
                style={[
                  active ? typography.bodyBold : typography.body,
                  active ? styles.brand : done ? styles.sub : styles.muted,
                ]}
              >
                {i === 0 && done ? '접수했어요' : s.label}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={[typography.caption, styles.sub]}>
        화면을 나가면 결과를 받지 않아요. 다시 녹음해야 해요
      </Text>
    </>
  );
}

function Levels({ levels }: { levels: number[] }) {
  return (
    <View style={styles.levels} accessible={false}>
      {levels.map((v, i) => (
        <View key={i} style={[styles.levelBar, { height: 6 + Math.round(v * 30) }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // 아래 버튼 줄(녹음 끝·실패·파일 큼)과 붙어 보이지 않게 본문 아래를 띄운다
  body: { gap: spacing[16], marginBottom: spacing[20] },
  flex: { flex: 1 },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
  muted: { color: colors.text.muted },
  brand: { color: colors.brand.primaryDark },
  hidden: { opacity: 0 },
  center: { alignItems: 'center', gap: spacing[10], paddingVertical: spacing[8] },
  centerText: { textAlign: 'center' },
  example: {
    gap: spacing[4],
    paddingHorizontal: spacing[16],
    paddingVertical: spacing[14],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  bigButton: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  stopSquare: { width: 24, height: 24, borderRadius: 5, backgroundColor: colors.surface.white },
  clockRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing[6] },
  levels: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 4 },
  levelBar: { width: 4, borderRadius: 2, backgroundColor: colors.brand.primary },
  progress: {
    alignSelf: 'stretch',
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.line.default,
    overflow: 'hidden',
  },
  progressFill: { height: 4, backgroundColor: colors.brand.primary },
  controls: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textButton: { paddingHorizontal: spacing[8], paddingVertical: spacing[12] },
  resultBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    paddingHorizontal: spacing[16],
    paddingVertical: spacing[14],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  circle: { borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  circleBrand: { backgroundColor: colors.brand.primaryBg },
  circleNeutral: { backgroundColor: colors.surface.default },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    padding: spacing[16],
    borderRadius: radius.lg,
  },
  noticeWarn: { backgroundColor: colors.status.warningBg2 },
  noticeDanger: { backgroundColor: colors.status.dangerBg },
  mascot: { alignItems: 'center', gap: spacing[4] },
  steps: { gap: spacing[14], paddingVertical: spacing[4] },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  stepDone: { width: 24, height: 24, backgroundColor: colors.brand.primary },
  stepIdle: { width: 24, height: 24, borderWidth: 2, borderColor: colors.line.default },
  row: { flexDirection: 'row', gap: spacing[10] },
});
