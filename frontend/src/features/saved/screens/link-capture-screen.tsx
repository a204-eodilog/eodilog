import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Stagger } from '@/components/ui/stagger';
import { apiErrorCode } from '@/api/errors';
import { Button, Header, Icon, type IconName, toast } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { caret, colors, layout, radius, spacing, typography } from '@/theme';

import type { CaptureFile } from '../api';
import {
  addCaptures,
  addSections,
  canFind,
  FEATURE_OFF_MESSAGE,
  isLink,
  linkStatus,
  MAX_CAPTURES,
  parseAddStart,
} from '../extract-rules';
import { useStartExtraction } from '../hooks/use-extraction';

/** 메모 최대 길이. 즐겨찾기 메모와 같은 서버 제한(2,000자) */
const MEMO_MAX = 2000;

type Capture = CaptureFile & { key: string };

/** 확장자로 형식 짐작. 기기 사진 고르기가 mimeType을 주지 않을 때 */
function guessType(uri: string): string {
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  return ext ? `image/${ext}` : 'application/octet-stream';
}

/**
 * S11 링크·캡처 등록. S10 저장 없음의 시작 카드에서 오면(?start=) 그쪽으로 바로 시작한다.
 * - link(시작 값 없음도 같음: S10 [+]·S20): 링크 칸에 커서. 아래 [+ 캡처도 추가]
 * - capture: 들어오자마자 사진 고르기. "선택한 캡처 n/10" 썸네일 줄 아래 [+ 링크도 추가]
 * 둘 다 넣으면 어느 쪽에서 시작했든 링크 → 캡처 순서로 보이고, [장소 찾기] 한 번에 함께 보낸다.
 * 메모는 접어 두고 [메모 남기기]를 눌러야 펼친다.
 * 링크가 웹 페이지 주소가 아니거나 파일 링크면 "지원하지 않는 형식"으로 바뀌고 보내지 않는다
 */
export function LinkCaptureScreen() {
  const insets = useSafeAreaInsets();
  const begin = parseAddStart(useLocalSearchParams<{ start?: string }>().start);
  const [link, setLink] = useState('');
  const [captures, setCapturesState] = useState<Capture[]>([]);
  // 앨범이 닫힌 뒤에 읽을 지금 목록(비동기 pick 안에서 처음 그린 때의 captures를 쓰지 않게)
  const capturesNow = useRef<Capture[]>([]);
  const [memo, setMemo] = useState('');
  const [memoOpen, setMemoOpen] = useState(false);
  // [+ 링크도 추가]·[+ 캡처도 추가]로 연 칸. 값을 지워도 칸은 남긴다
  const [linkOpened, setLinkOpened] = useState(false);
  const [captureOpened, setCaptureOpened] = useState(false);
  // 클립보드에 있는 링크(값 문서 "복사한 링크 안내"). 붙여 넣었거나 이미 칸에 같은 링크가 있으면 숨긴다
  const [copied, setCopied] = useState<string | null>(null);
  const start = useStartExtraction();
  // 빠르게 두 번 누르면 다시 그리기 전이라 isPending이 아직 false라서 ref로 바로 막는다
  const sending = useRef(false);

  const setCaptures = (next: Capture[]) => {
    capturesNow.current = next;
    setCapturesState(next);
  };

  const status = linkStatus(link);
  const unsupported = status === 'unsupported';
  const ready = canFind(link, captures.length);
  const { showLink, showCaptures } = addSections(begin, {
    linkOpened,
    captureOpened,
    link,
    captureCount: captures.length,
  });

  // 화면에 들어올 때마다 클립보드를 본다(다른 앱에서 링크를 복사해 돌아온 경우)
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Clipboard.getStringAsync()
        .then((text) => {
          if (alive) setCopied(isLink(text) ? text.trim() : null);
        })
        .catch(() => undefined);
      return () => {
        alive = false;
      };
      // setCopied는 바뀌지 않지만, 컴파일러가 의존성으로 읽어 적어 둔다
    }, [setCopied]),
  );

  const paste = async (text?: string | null) => {
    const value = (text ?? (await Clipboard.getStringAsync().catch(() => ''))).trim();
    if (!value) {
      toast.show('복사한 링크가 없어요');
      return;
    }
    setLinkOpened(true);
    setLink(value);
    setCopied(null);
  };

  const pick = async () => {
    const room = MAX_CAPTURES - capturesNow.current.length;
    if (room <= 0) {
      toast.show(`캡처는 한 번에 ${MAX_CAPTURES}장까지 넣을 수 있어요`);
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: room,
        orderedSelection: true,
        quality: 1,
      });
      if (result.canceled) return;
      const picked: Capture[] = result.assets.map((a, i) => ({
        key: `${a.assetId ?? a.uri}-${Date.now()}-${i}`,
        uri: a.uri,
        contentType: a.mimeType ?? guessType(a.uri),
        byteSize: a.fileSize ?? 0,
      }));
      // 앨범이 열린 사이에 썸네일을 뺐을 수 있어, 앨범을 연 때가 아니라 지금 목록에 더한다
      const next = addCaptures(capturesNow.current, picked);
      setCaptures(next.captures);
      if (next.skippedType > 0) toast.show('JPG·PNG 캡처만 넣을 수 있어요');
      else if (next.skippedLimit > 0) {
        toast.show(`캡처는 한 번에 ${MAX_CAPTURES}장까지 넣을 수 있어요`);
      }
    } catch {
      toast.error('사진을 불러오지 못했어요');
    }
  };

  // [캡처 올리기]로 왔으면 들어오자마자 한 번만 사진 고르기를 연다. 닫으면 이 화면에 그대로 남는다
  const picked = useRef(false);
  useEffect(() => {
    if (begin !== 'capture' || picked.current) return;
    picked.current = true;
    void pick();
    // 처음 들어올 때 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [begin]);

  const addCapture = () => {
    setCaptureOpened(true);
    void pick();
  };

  const find = () => {
    if (!ready || sending.current) return;
    sending.current = true;
    start.mutate(
      { link, captures, memo },
      {
        onSuccess: (jobId) => {
          sending.current = false;
          router.push({ pathname: '/saved/extract/[jobId]', params: { jobId } });
        },
        onError: (error) => {
          sending.current = false;
          if (apiErrorCode(error) === 'AI_FEATURE_DISABLED') {
            toast.error(FEATURE_OFF_MESSAGE, {
              action: { label: '설정', onPress: () => router.push('/settings') },
            });
            return;
          }
          toast.error('장소 찾기를 시작하지 못했어요. 다시 시도해 주세요');
        },
      },
    );
  };

  const showCopied = showLink && copied !== null && copied !== link.trim() && !unsupported;
  const full = captures.length >= MAX_CAPTURES;

  return (
    <View style={styles.screen}>
      <Header title="장소 가져오기" largeTitle />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Stagger itemStyle={styles.staggerItem}>
            {showCopied ? (
              <View style={styles.copied}>
                <Icon name="copy" size={20} color={colors.brand.primaryDark} />
                <View style={styles.copiedTexts}>
                  <Text style={[typography.captionMedium, styles.dark]}>복사한 링크가 있어요</Text>
                  <Text style={[typography.body, styles.text]} numberOfLines={1}>
                    {copied}
                  </Text>
                </View>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel="복사한 링크 붙여넣기"
                  onPress={() => void paste(copied)}
                  hitSlop={4}
                  style={({ pressed }) => [styles.copiedPaste, pressed && styles.pressed]}
                >
                  <Icon name="clipboard" size={20} color={colors.brand.primaryDark} />
                </PressableScale>
              </View>
            ) : null}

            {showLink ? (
              <View style={styles.section}>
                <SectionLabel icon="link" label="링크" />
                <View>
                  <TextInput
                    {...caret}
                    accessibilityLabel="링크"
                    value={link}
                    onChangeText={setLink}
                    placeholder="링크를 붙여 넣어 주세요"
                    // 링크로 시작했거나, [+ 링크도 추가]로 칸이 새로 생긴 때 바로 커서를 둔다
                    autoFocus={begin !== 'capture' || linkOpened}
                    placeholderTextColor={colors.text.sub}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    returnKeyType="done"
                    style={[styles.inputText, styles.input, styles.linkInput]}
                  />
                  {link.length > 0 ? (
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel="링크 지우기"
                      hitSlop={8}
                      onPress={() => setLink('')}
                      style={({ pressed }) => [styles.clearLink, pressed && styles.pressed]}
                    >
                      <Icon name="close" size={14} color={colors.text.inverse} />
                    </PressableScale>
                  ) : (
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel="붙여넣기"
                      hitSlop={4}
                      onPress={() => void paste()}
                      style={({ pressed }) => [styles.pasteButton, pressed && styles.pressed]}
                    >
                      {/* 복사 아이콘은 "복사"로 읽혀 집게판 아이콘을 따로 쓴다 */}
                      <Icon name="clipboard" size={18} color={colors.brand.primaryDark} />
                    </PressableScale>
                  )}
                </View>
                {unsupported ? (
                  <>
                    <View style={styles.errorLine} accessibilityLiveRegion="polite">
                      <Icon name="alert" size={16} color={colors.status.danger} />
                      <Text style={[typography.captionMedium, styles.danger]}>
                        이 형식에서는 장소를 찾을 수 없어요
                      </Text>
                    </View>
                    <View style={styles.guide}>
                      <Text style={[typography.captionMedium, styles.sub]}>
                        이런 것을 넣어 주세요
                      </Text>
                      <View style={styles.guideRow}>
                        <Icon name="link" size={20} color={colors.text.icon} />
                        <Text style={[typography.body, styles.text]}>
                          SNS 게시물, 블로그 글 링크
                        </Text>
                      </View>
                      <View style={styles.guideRow}>
                        <Icon name="image" size={20} color={colors.text.icon} />
                        <Text style={[typography.body, styles.text]}>캡처 이미지 (JPG, PNG)</Text>
                      </View>
                    </View>
                  </>
                ) : null}
                {showCaptures ? null : <AddMore label="캡처도 추가" onPress={addCapture} />}
              </View>
            ) : null}

            {showCaptures ? (
              <View style={styles.section}>
                <View style={styles.labelRow}>
                  <Icon name="image" size={16} color={colors.text.icon} />
                  <Text style={[typography.captionMedium, styles.sub]}>선택한 캡처</Text>
                  <Text style={[typography.captionMedium, styles.dark]}>
                    {captures.length}/{MAX_CAPTURES}
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.captures}
                >
                  {captures.map((c, i) => (
                    <View key={c.key} style={styles.thumb}>
                      <Image source={{ uri: c.uri }} style={styles.thumbImage} />
                      <PressableScale
                        accessibilityRole="button"
                        accessibilityLabel={`캡처 ${i + 1} 빼기`}
                        hitSlop={8}
                        onPress={() =>
                          setCaptures(capturesNow.current.filter((x) => x.key !== c.key))
                        }
                        style={styles.removeCapture}
                      >
                        <Icon name="close" size={14} color={colors.text.inverse} />
                      </PressableScale>
                    </View>
                  ))}
                  {full ? null : (
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={`캡처 더 고르기, 최대 ${MAX_CAPTURES}장`}
                      onPress={() => void pick()}
                      style={({ pressed }) => [styles.addCapture, pressed && styles.pressed]}
                    >
                      <Icon name="plus" size={22} color={colors.text.icon} />
                    </PressableScale>
                  )}
                </ScrollView>
                {showLink ? null : (
                  <AddMore label="링크도 추가" onPress={() => setLinkOpened(true)} />
                )}
              </View>
            ) : null}

            {memoOpen || memo.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.labelRow}>
                  <Icon name="pencil" size={16} color={colors.text.icon} />
                  <Text style={[typography.captionMedium, styles.sub]}>메모</Text>
                </View>
                <TextInput
                  {...caret}
                  accessibilityLabel="메모"
                  value={memo}
                  onChangeText={setMemo}
                  placeholder="예: 노을 질 때 가 보기"
                  placeholderTextColor={colors.text.sub}
                  maxLength={MEMO_MAX}
                  multiline
                  autoFocus
                  textAlignVertical="top"
                  style={[styles.inputText, styles.input, styles.memo]}
                />
              </View>
            ) : (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="메모 남기기"
                onPress={() => setMemoOpen(true)}
                style={({ pressed }) => [styles.memoClosed, pressed && styles.pressed]}
              >
                <Icon name="pencil" size={18} color={colors.text.icon} />
                <Text style={[typography.body, styles.sub, styles.flex]}>메모 남기기</Text>
                {/* 아이콘 모음에 아래 꺾쇠가 없어 오른쪽 꺾쇠를 돌린다 */}
                <View style={styles.down}>
                  <Icon name="chevron-right" size={18} color={colors.text.muted} />
                </View>
              </PressableScale>
            )}
          </Stagger>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + spacing[12], 34) }]}>
          <Button
            label="장소 찾기"
            icon="search"
            size="xl"
            block
            disabled={!ready}
            loading={start.isPending}
            onPress={find}
            style={ready ? undefined : styles.findOff}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function SectionLabel({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.labelRow}>
      <Icon name={icon} size={16} color={colors.text.icon} />
      <Text style={[typography.captionMedium, styles.sub]}>{label}</Text>
    </View>
  );
}

/** 다른 자료를 더 넣는 작은 보조 버튼([+ 캡처도 추가]·[+ 링크도 추가]) */
function AddMore({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.addMore, pressed && styles.pressed]}
    >
      <Icon name="plus" size={16} color={colors.brand.primaryDark} />
      <Text style={[typography.captionMedium, styles.dark]}>{label}</Text>
    </PressableScale>
  );
}

const THUMB = 80;

const styles = StyleSheet.create({
  // 차례로 나타나는 구역을 감싼 칸. 한 구역이 여러 줄이면 그 사이 간격을 스크롤 내용과 같게 둔다
  staggerItem: { gap: spacing[28] },
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  body: {
    paddingTop: spacing[16],
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: spacing[24],
    gap: spacing[28],
  },
  // 값 문서: 연파랑, 둥글기 16, 안쪽 14/8/14/18, 가로 간격 18
  copied: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[18],
    paddingTop: spacing[14],
    paddingRight: spacing[8],
    paddingBottom: spacing[14],
    paddingLeft: spacing[18],
    borderRadius: radius.lg,
    backgroundColor: colors.brand.primaryBg,
  },
  copiedTexts: { flex: 1 },
  copiedPaste: { height: 36, paddingHorizontal: spacing[12], justifyContent: 'center' },
  section: { gap: spacing[12] },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  // 입력칸 글자. 줄 높이(lineHeight)를 주면 안드로이드가 커서를 칸 높이만큼 길게 그려서 주지 않는다(TextField와 같다)
  inputText: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    includeFontPadding: false,
  },
  // 회색 상자 입력칸(값 문서: 공통 TextField는 밑줄이라 모양이 다르다)
  input: {
    color: colors.text.default,
    backgroundColor: colors.surface.default,
    borderRadius: radius.md,
  },
  // 안드로이드는 글 줄 높이(26) 때문에 자리 글자가 위로 붙어 가운데로 맞춘다
  linkInput: {
    height: 52,
    paddingVertical: 0,
    paddingLeft: spacing[16],
    // 오른쪽 [붙여넣기] 글자 버튼 자리
    paddingRight: 96,
    textAlignVertical: 'center',
  },
  pasteButton: {
    position: 'absolute',
    right: spacing[8],
    top: 8,
    paddingHorizontal: spacing[12],
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.white,
  },
  // 링크 [×]: 캡처 빼기 버튼과 같은 모양
  clearLink: {
    position: 'absolute',
    right: spacing[14],
    top: 14,
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray[400],
  },
  addMore: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    height: 32,
    paddingHorizontal: spacing[12],
    borderRadius: radius.full,
    backgroundColor: colors.brand.primaryBg,
  },
  errorLine: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  guide: {
    gap: spacing[12],
    padding: spacing[20],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  guideRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  // 빼기 버튼이 썸네일 밖으로 6 나와서 잘리지 않게 위·오른쪽 여유
  captures: { gap: spacing[8], paddingTop: spacing[6], paddingRight: spacing[6] },
  addCapture: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.default,
  },
  thumb: { width: THUMB, height: THUMB },
  thumbImage: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.md,
    backgroundColor: colors.surface.default,
  },
  removeCapture: {
    position: 'absolute',
    top: -spacing[6],
    right: -spacing[6],
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.text.default,
  },
  memo: { height: 88, paddingVertical: spacing[16], paddingHorizontal: spacing[18] },
  memoClosed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    height: 52,
    paddingHorizontal: spacing[16],
    borderRadius: radius.md,
    backgroundColor: colors.surface.default,
  },
  down: { transform: [{ rotate: '90deg' }] },
  // 피그마는 오른쪽 아래 작은 알약 버튼. 이 화면의 마지막 행동이라 아래 꽉 찬 큰 버튼으로 둔다
  footer: {
    paddingTop: spacing[12],
    paddingHorizontal: layout.screenPaddingX,
  },
  // 값 문서: 누를 수 없으면 흐림 0.32
  findOff: { opacity: 0.32 },
  pressed: { opacity: 0.6 },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
  dark: { color: colors.brand.primaryDark },
  danger: { color: colors.status.danger },
});
