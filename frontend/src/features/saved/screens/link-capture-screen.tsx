import { SCROLL_DECELERATION } from '@/theme/scroll';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Stagger } from '@/components/ui/stagger';
import { apiErrorCode } from '@/api/errors';
import { Button, Header, Icon, toast } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import { KeyboardLift, useKeyboardShift } from '@/components/ui/keyboard-lift';
import { useKeyboardVisible } from '@/hooks/use-keyboard-visible';
import { caret, colors, layout, radius, spacing, typography } from '@/theme';

import type { CaptureFile } from '../api';
import {
  addCaptures,
  canFind,
  FEATURE_OFF_MESSAGE,
  cleanLinkInput,
  linkIn,
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
 * S11 링크·캡처 등록. 위에서부터 게시물 링크 → 캡처 이미지 → 메모 추가(접힘). 링크 칸과 캡처 줄은 처음부터 함께 보인다.
 * - 시작 값 없음(S10 머리의 북마크 +·S20): 키보드를 올리지 않아 두 입력 방법이 바로 보인다
 * - link(S10 저장 없음 [링크 붙여넣기]): 링크 칸에 커서
 * - capture(S10 저장 없음 [캡처 올리기]): 들어오자마자 앨범을 연다
 * 링크와 캡처는 서로의 값을 지키며, 둘 다 넣으면 [장소 찾기] 한 번에 메모와 함께 보낸다.
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
  // 메모는 접어서 시작한다. 다시 접어도 쓴 메모는 남는다
  const [memoOpen, setMemoOpen] = useState(false);
  const [memoFocused, setMemoFocused] = useState(false);
  const keyboardVisible = useKeyboardVisible();
  const scroll = useRef<ScrollViewInstance>(null);
  // 자판을 따라 움직이는 값(없으면 0, 올라오면 음수)
  const shift = useKeyboardShift();
  // 자판이 없을 때는 기기 아래 막대만큼 비우고, 자판이 올라오는 만큼 그 여백을 줄여 버튼이 자판 바로 위에 붙는다
  const restPad = Math.max(insets.bottom + spacing[12], 34);
  const footerPad = useAnimatedStyle(() => ({
    paddingBottom: Math.max(restPad + shift.get(), spacing[12]),
  }));
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

  // 화면에 들어올 때마다 클립보드를 본다(다른 앱에서 링크를 복사해 돌아온 경우)
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Clipboard.getStringAsync()
        .then((text) => {
          // 지도 앱 공유 글처럼 이름·주소가 섞여 있어도 링크만 골라 안내한다
          if (alive) setCopied(linkIn(text));
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
    setLink(cleanLinkInput(value));
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

  // 메모는 화면 맨 아래 칸이라, 자판이 올라오면 목록을 끝까지 내려 메모 칸이 자판 위에 보이게 한다
  useEffect(() => {
    if (!memoFocused || !keyboardVisible) return;
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [memoFocused, keyboardVisible]);

  const showCopied = copied !== null && copied !== link.trim() && !unsupported;
  const full = captures.length >= MAX_CAPTURES;
  // 누를 수 있거나 보내는 중이면 파랑, 아니면 회색 바탕에 읽을 수 있는 회색 글자
  const findOn = ready || start.isPending;

  return (
    <View style={styles.screen}>
      <Header title="장소 가져오기" largeTitle />
      {/* 자판이 오르내리는 높이를 그대로 따라 아래를 비운다(KeyboardLift) */}
      <KeyboardLift style={styles.flex}>
        <ScrollView
          ref={scroll}
          decelerationRate={SCROLL_DECELERATION}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Stagger itemStyle={styles.staggerItem}>
            <Text style={[typography.body, styles.sub2]}>링크나 캡처 중 하나만 넣어도 돼요</Text>

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

            {/* 게시물 링크 */}
            <View style={styles.section}>
              <Text style={[typography.subBold, styles.text]}>게시물 링크</Text>
              <View>
                <TextInput
                  {...caret}
                  accessibilityLabel="게시물 링크"
                  value={link}
                  // 자판의 붙여넣기로 공유 글이 통째로 들어와도 링크만 남긴다
                  onChangeText={(t) => setLink(cleanLinkInput(t))}
                  placeholder="SNS·블로그 링크"
                  // 빈 화면의 [링크 붙여넣기]로 왔을 때만 바로 커서를 둔다. 머리 북마크 +로 오면 키보드를 올리지 않는다
                  autoFocus={begin === 'link'}
                  placeholderTextColor={colors.text.sub2}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="done"
                  style={[
                    styles.inputText,
                    styles.input,
                    styles.linkInput,
                    unsupported && styles.inputError,
                  ]}
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
                    onPress={() => void paste()}
                    style={({ pressed }) => [styles.pasteButton, pressed && styles.pressed]}
                  >
                    <Text style={[typography.captionBold, styles.brand]}>붙여넣기</Text>
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
                      <Text style={[typography.body, styles.text]}>SNS 게시물, 블로그 글 링크</Text>
                    </View>
                    <View style={styles.guideRow}>
                      <Icon name="image" size={20} color={colors.text.icon} />
                      <Text style={[typography.body, styles.text]}>캡처 이미지 (JPG, PNG)</Text>
                    </View>
                  </View>
                </>
              ) : null}
            </View>

            {/* 캡처 이미지. 고르기 전에는 [앨범에서 선택] 한 줄, 고르면 같은 자리에 썸네일 줄 */}
            <View style={styles.section}>
              <View style={styles.titleRow}>
                <Text style={[typography.subBold, styles.text]}>캡처 이미지</Text>
                <Text style={[typography.caption, styles.sub2]}>
                  {captures.length > 0
                    ? `${captures.length}/${MAX_CAPTURES}`
                    : `최대 ${MAX_CAPTURES}장`}
                </Text>
              </View>
              {captures.length === 0 ? (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`앨범에서 캡처 선택, 최대 ${MAX_CAPTURES}장`}
                  onPress={() => void pick()}
                  style={({ pressed }) => [styles.albumRow, pressed && styles.pressed]}
                >
                  <Icon name="image" size={20} color={colors.text.icon} />
                  <Text style={[typography.body, styles.text, styles.flex]}>앨범에서 선택</Text>
                  <Icon name="chevron-right" size={18} color={colors.text.muted} />
                </PressableScale>
              ) : (
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
              )}
            </View>

            {/* 메모 추가(선택). 얇은 선 아래 한 줄, 누르면 그 자리에서 펼친다 */}
            <View style={styles.memoBlock}>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="메모 추가, 선택"
                accessibilityState={{ expanded: memoOpen }}
                onPress={() => setMemoOpen((v) => !v)}
                style={({ pressed }) => [styles.memoRow, pressed && styles.pressed]}
              >
                <Icon name="pencil" size={18} color={colors.text.icon} />
                <Text style={[typography.body, styles.text]}>메모 추가</Text>
                <Text style={[typography.caption, styles.sub2, styles.flex]}>선택</Text>
                <Icon
                  name={memoOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.text.muted}
                />
              </PressableScale>
              {memoOpen ? (
                <TextInput
                  {...caret}
                  accessibilityLabel="메모"
                  value={memo}
                  onChangeText={setMemo}
                  placeholder="예: 노을 질 때 가 보기"
                  placeholderTextColor={colors.text.sub2}
                  maxLength={MEMO_MAX}
                  multiline
                  autoFocus
                  onFocus={() => setMemoFocused(true)}
                  onBlur={() => setMemoFocused(false)}
                  textAlignVertical="top"
                  style={[styles.inputText, styles.input, styles.memo]}
                />
              ) : null}
            </View>
          </Stagger>
        </ScrollView>

        <Animated.View style={[styles.footer, footerPad]}>
          <Button
            label="장소 찾기"
            size="xl"
            block
            variant={findOn ? 'primary' : 'neutral'}
            disabled={!ready}
            loading={start.isPending}
            onPress={find}
            // 누를 수 없을 때도 흐리게 하지 않는다. 회색 바탕과 글자로만 구분해 문구가 또렷하다
            style={findOn ? undefined : styles.findOff}
          />
        </Animated.View>
      </KeyboardLift>
    </View>
  );
}

const THUMB = 80;

const styles = StyleSheet.create({
  // 차례로 나타나는 구역을 감싼 칸. 한 구역이 여러 줄이면 그 사이 간격을 스크롤 내용과 같게 둔다
  staggerItem: { gap: spacing[24] },
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  body: {
    paddingTop: spacing[4],
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: spacing[24],
    gap: spacing[24],
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
  section: { gap: spacing[10] },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // 입력칸 글자. 줄 높이(lineHeight)를 주면 안드로이드가 커서를 칸 높이만큼 길게 그려서 주지 않는다(TextField와 같다)
  inputText: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    includeFontPadding: false,
  },
  // 흰 바탕에 얇은 테두리 입력칸
  input: {
    color: colors.text.default,
    backgroundColor: colors.surface.white,
    borderWidth: 1,
    borderColor: colors.line.strong,
    borderRadius: radius.md,
  },
  inputError: { borderColor: colors.status.danger },
  // 안드로이드는 글 줄 높이(26) 때문에 자리 글자가 위로 붙어 가운데로 맞춘다
  linkInput: {
    height: 52,
    paddingVertical: 0,
    paddingLeft: spacing[16],
    // 오른쪽 [붙여넣기] 글자 버튼 자리
    paddingRight: 88,
    textAlignVertical: 'center',
  },
  // [붙여넣기] 파란 글자 버튼. 칸 높이 52를 다 누를 수 있다
  pasteButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    paddingHorizontal: spacing[16],
    alignItems: 'center',
    justifyContent: 'center',
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
  errorLine: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  guide: {
    gap: spacing[12],
    padding: spacing[20],
    borderRadius: radius.lg,
    backgroundColor: colors.surface.default,
  },
  guideRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  // [앨범에서 선택] 한 줄. 링크 칸과 같은 높이·테두리
  albumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    height: 52,
    paddingHorizontal: spacing[16],
    borderWidth: 1,
    borderColor: colors.line.strong,
    borderRadius: radius.md,
    backgroundColor: colors.surface.white,
  },
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
  // 메모: 위 얇은 선 아래 한 줄(누르는 칸 48)
  memoBlock: {
    gap: spacing[8],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line.strong,
    paddingTop: spacing[4],
  },
  memoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[8], minHeight: 48 },
  memo: { height: 96, paddingVertical: spacing[14], paddingHorizontal: spacing[16] },
  // 피그마는 오른쪽 아래 작은 알약 버튼. 이 화면의 마지막 행동이라 아래 꽉 찬 큰 버튼으로 둔다
  footer: {
    paddingTop: spacing[12],
    paddingHorizontal: layout.screenPaddingX,
  },
  // 누를 수 없을 때: 흐림 없이 회색 바탕(neutral)과 회색 글자(text.icon)로만 보인다
  findOff: { opacity: 1 },
  pressed: { opacity: 0.6 },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
  sub2: { color: colors.text.sub },
  brand: { color: colors.brand.primary },
  dark: { color: colors.brand.primaryDark },
  danger: { color: colors.status.danger },
});
