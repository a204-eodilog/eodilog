import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ConfirmSheet, Header, Icon, TextField, toast } from '@/components/ui';
import { KeyboardLift } from '@/components/ui/keyboard-lift';
import { PressableScale } from '@/components/ui/pressable-scale';
import { formatClock } from '@/lib/voice-recording';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { useLiveTranscript } from '../hooks/use-live-transcript';
import { beginVoiceTrip } from '../voice-trip-store';

/** 한 번에 말할 수 있는 길이 */
const MAX_MS = 10 * 60 * 1000;
const MIN_CHARS = 5;

const join = (a: string, b: string) => [a.trim(), b.trim()].filter(Boolean).join(' ');

/**
 * 실험: 말로 새 여행 만들기 1단계. 어디로, 언제, 날마다 뭐 할지 쭉 말한다(최대 10분).
 * 말하는 동안 폰 음성인식으로 받아쓴 글이 바로 보인다. ✓를 누르면 확인 화면에서 잘못 들린 곳을 키패드로 고치고,
 * [이대로 정리하기]를 눌러야 서버로 보낸다(녹음 파일은 보내지 않고 고친 글만 보낸다).
 */
export function VoiceTripRecordScreen() {
  const insets = useSafeAreaInsets();
  const live = useLiveTranscript(MAX_MS);
  const [denied, setDenied] = useState<'denied' | 'unavailable' | null>(null);
  // 'speak': 듣는 중, 'check': 받아쓴 글 확인·고치기
  const [mode, setMode] = useState<'speak' | 'check'>('speak');
  // 확인 화면의 글. 다시 말하면 이 뒤에 이어 붙는다
  const [text, setText] = useState('');
  const [leaving, setLeaving] = useState(false);
  const started = useRef(false);
  const scroll = useRef<ScrollViewInstance>(null);

  const begin = () => void live.start().then((r) => setDenied(r === 'started' ? null : r));

  // 들어오면 바로 듣는다(한 번만)
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 10분이 되면 멈춘다. 확인 화면으로 넘긴다
  const listening = live.phase === 'listening';
  const paused = live.phase === 'paused';
  const reachedMax = paused && live.elapsedMs >= MAX_MS;
  useEffect(() => {
    if (reachedMax && mode === 'speak') void toCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reachedMax]);

  async function toCheck() {
    if (live.phase === 'finishing') return;
    const heard = await live.finish();
    setText((prev) => join(prev, heard));
    setMode('check');
  }

  function speakMore() {
    setMode('speak');
    begin();
  }

  function send() {
    const body = text.trim();
    if (body.length < MIN_CHARS) {
      toast.show('조금 더 말하거나 적어 주세요');
      return;
    }
    void beginVoiceTrip({ text: body });
    router.replace('/trips/voice-draft');
  }

  const close = () => {
    if (join(text, live.text)) setLeaving(true);
    else router.back();
  };

  const shown = join(text, live.text);

  return (
    <View style={styles.screen}>
      <Header
        close
        onBack={close}
        title="말로 만들기"
        right={
          mode === 'speak' ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="글로 쓰기"
              onPress={() => void toCheck()}
              style={styles.headerButton}
            >
              <Icon name="pencil" size={20} color={colors.text.icon} />
            </PressableScale>
          ) : undefined
        }
      />
      <KeyboardLift style={styles.flex}>
        {mode === 'check' ? (
          <>
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              <Text style={[typography.heading, styles.title]}>이렇게 들었어요</Text>
              <Text style={[typography.bodySmall, styles.sub]}>
                잘못 들린 곳은 눌러서 고쳐 주세요. 고친 대로 여행 초안을 만들어요.
              </Text>
              <TextField
                variant="filled"
                value={text}
                onChangeText={setText}
                placeholder="11월 20일부터 2박 3일로 부산 가려고. 첫날은 해운대 가고, 점심은 돼지국밥…"
                multiline
                maxLength={8000}
                hideCount
                boxStyle={styles.textBox}
                style={styles.textInput}
                accessibilityLabel="받아쓴 여행 계획"
              />
            </ScrollView>
            <View style={[styles.bottomRow, { paddingBottom: insets.bottom + spacing[16] }]}>
              <Button
                label="더 말하기"
                variant="secondary"
                size="xl"
                onPress={speakMore}
                style={styles.more}
              />
              <Button label="이대로 정리하기" size="xl" onPress={send} style={styles.go} />
            </View>
          </>
        ) : (
          <>
            <ScrollView
              ref={scroll}
              contentContainerStyle={styles.body}
              onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
            >
              <Text style={[typography.heading, styles.title]}>
                어떤 여행인지{'\n'}쭉 말해 주세요
              </Text>
              <Text style={[typography.bodySmall, styles.sub]}>
                말한 것만 넣고, 말하지 않은 건 비워 둬요. 다 말하면 들은 내용을 확인하고 고칠 수
                있어요.
              </Text>
              <View style={styles.liveBox}>
                {denied ? (
                  <Text style={[typography.body, styles.placeholder]}>
                    {denied === 'denied'
                      ? '마이크를 쓸 수 없어요. 설정에서 마이크를 허용하거나, 오른쪽 위 연필로 글을 써 주세요.'
                      : '이 폰에서는 음성인식을 쓸 수 없어요. 오른쪽 위 연필로 글을 써 주세요.'}
                  </Text>
                ) : shown ? (
                  <Text style={[typography.body, styles.liveText]}>
                    {join(text, live.heard)}
                    {live.interim ? <Text style={styles.interim}>{' ' + live.interim}</Text> : null}
                  </Text>
                ) : (
                  <Text style={[typography.body, styles.placeholder]}>
                    {listening ? '듣고 있어요. 말하면 여기에 글자로 나와요' : '준비하고 있어요'}
                  </Text>
                )}
              </View>
            </ScrollView>

            <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing[20] }]}>
              <View style={styles.wave} accessibilityElementsHidden>
                {live.levels.map((v, i) => (
                  <View
                    key={i}
                    style={[styles.bar, { height: 4 + v * 26 }, !listening && styles.barIdle]}
                  />
                ))}
              </View>
              <Text style={[typography.heading, styles.clock]}>
                {formatClock(live.elapsedMs)}
                <Text style={[typography.sub, styles.clockMax]}> / 10:00</Text>
              </Text>
              {/* 시안 A2: 다시 · 정지(가운데, 크게) · 다 말했어요(오른쪽, 앱 파란색) */}
              <View style={styles.controls}>
                <View style={styles.ctl}>
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel="처음부터 다시"
                    onPress={() => {
                      live.reset();
                      setText('');
                      begin();
                    }}
                    style={styles.side}
                  >
                    <Icon name="refresh" size={24} color={colors.text.icon} />
                  </PressableScale>
                  <Text style={[typography.caption, styles.ctlLabel]}>다시</Text>
                </View>
                <View style={styles.ctl}>
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel={paused ? '이어 말하기' : '정지'}
                    disabled={!listening && !paused}
                    onPress={() => (paused ? live.resume() : live.pause())}
                    style={[styles.main, !listening && !paused && styles.mainOff]}
                  >
                    <Icon name={paused ? 'play' : 'pause'} size={32} color={colors.brand.primary} />
                  </PressableScale>
                  <Text style={[typography.caption, styles.ctlLabel]}>
                    {paused ? '이어서' : '정지'}
                  </Text>
                </View>
                <View style={styles.ctl}>
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel="다 말했어요"
                    disabled={!listening && !paused}
                    onPress={() => void toCheck()}
                    style={[styles.done, !listening && !paused && styles.doneOff]}
                  >
                    <Icon name="check" size={26} color={colors.text.inverse} />
                  </PressableScale>
                  <Text style={[typography.caption, styles.ctlLabel]}>다 말했어요</Text>
                </View>
              </View>
              <Text style={[typography.caption, styles.hint]}>
                {live.phase === 'finishing'
                  ? '마지막 말까지 받아쓰는 중이에요'
                  : '다 말했으면 ✓를 눌러 주세요. 들은 내용을 보여 드려요'}
              </Text>
            </View>
          </>
        )}
      </KeyboardLift>

      <ConfirmSheet
        visible={leaving}
        onClose={() => setLeaving(false)}
        onConfirm={() => {
          setLeaving(false);
          live.reset();
          router.back();
        }}
        title="말한 내용을 버릴까요?"
        description="나가면 지금까지 말한 내용은 남지 않아요"
        confirmLabel="버리기"
        cancelLabel="계속하기"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  headerButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[20],
    paddingBottom: spacing[16],
    gap: spacing[12],
    flexGrow: 1,
  },
  title: { color: colors.text.default },
  sub: { color: colors.text.sub },
  liveBox: {
    flexGrow: 1,
    minHeight: 200,
    marginTop: spacing[8],
    borderWidth: 1,
    borderColor: colors.line.default,
    borderRadius: radius.lg,
    padding: spacing[16],
  },
  liveText: { color: colors.text.default },
  interim: { color: colors.text.muted },
  placeholder: { color: colors.text.muted },
  textBox: { minHeight: 260, alignItems: 'flex-start', paddingVertical: spacing[12] },
  textInput: { minHeight: 236, textAlignVertical: 'top' },
  bottom: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[12],
    alignItems: 'center',
    gap: spacing[10],
  },
  bottomRow: {
    flexDirection: 'row',
    gap: spacing[10],
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[12],
  },
  more: { flex: 2 },
  go: { flex: 3 },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 30 },
  bar: { width: 4, borderRadius: 2, backgroundColor: colors.brand.primary },
  barIdle: { backgroundColor: colors.gray[300] },
  clock: { color: colors.text.default },
  clockMax: { color: colors.text.muted },
  controls: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[24] },
  ctl: { alignItems: 'center', gap: spacing[4], minWidth: 72 },
  ctlLabel: { color: colors.text.sub },
  side: {
    width: 56,
    height: 56,
    marginTop: 12,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.default,
  },
  main: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.brand.primary,
    backgroundColor: colors.surface.white,
  },
  mainOff: { borderColor: colors.gray[300] },
  done: {
    width: 56,
    height: 56,
    marginTop: 12,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.primary,
  },
  doneOff: { backgroundColor: colors.gray[400] },
  hint: { color: colors.text.sub, textAlign: 'center' },
});
