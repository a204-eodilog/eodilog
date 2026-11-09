import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { apiErrorCode } from '@/api/errors';
import { Button, Header, Icon, type IconName, toast } from '@/components/ui';
import { colors, layout, radius, spacing, typography } from '@/theme';

import type { CaptureFile } from '../api';
import {
  addCaptures,
  canFind,
  FEATURE_OFF_MESSAGE,
  isLink,
  linkStatus,
  MAX_CAPTURES,
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
 * S11 링크·캡처 등록. S10 [+]에서 연다(S20은 화면이 생기면).
 * 링크 붙여넣기, 캡처 고르기(최대 10장, JPG·PNG), 메모 → [장소 찾기]: 캡처를 올리고 추출 작업을 보낸 뒤 S12 진행 중.
 * 링크가 웹 페이지 주소가 아니거나 파일 링크면 "지원하지 않는 형식"으로 바뀌고 보내지 않는다
 */
export function LinkCaptureScreen() {
  const insets = useSafeAreaInsets();
  const [link, setLink] = useState('');
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [memo, setMemo] = useState('');
  // 클립보드에 있는 링크(값 문서 "복사한 링크 안내"). 붙여 넣었거나 이미 칸에 같은 링크가 있으면 숨긴다
  const [copied, setCopied] = useState<string | null>(null);
  const start = useStartExtraction();
  // 빠르게 두 번 누르면 다시 그리기 전이라 isPending이 아직 false라서 ref로 바로 막는다
  const sending = useRef(false);

  const status = linkStatus(link);
  const unsupported = status === 'unsupported';
  const ready = canFind(link, captures.length);

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
    }, []),
  );

  const paste = async (text?: string | null) => {
    const value = (text ?? (await Clipboard.getStringAsync().catch(() => ''))).trim();
    if (!value) {
      toast.show('복사한 링크가 없어요');
      return;
    }
    setLink(value);
    setCopied(null);
  };

  const pick = async () => {
    const room = MAX_CAPTURES - captures.length;
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
      const next = addCaptures(captures, picked);
      setCaptures(next.captures);
      if (next.skippedType > 0) toast.show('JPG·PNG 캡처만 넣을 수 있어요');
      else if (next.skippedLimit > 0) {
        toast.show(`캡처는 한 번에 ${MAX_CAPTURES}장까지 넣을 수 있어요`);
      }
    } catch {
      toast.error('사진을 불러오지 못했어요');
    }
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

  const showCopied = copied !== null && copied !== link.trim() && !unsupported;

  return (
    <View style={styles.screen}>
      <Header title="장소 가져오기" largeTitle />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {showCopied ? (
            <View style={styles.copied}>
              <Icon name="copy" size={20} color={colors.brand.primaryDark} />
              <View style={styles.copiedTexts}>
                <Text style={[typography.captionMedium, styles.dark]}>복사한 링크가 있어요</Text>
                <Text style={[typography.body, styles.text]} numberOfLines={1}>
                  {copied}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="복사한 링크 붙여넣기"
                onPress={() => void paste(copied)}
                style={({ pressed }) => [styles.copiedPaste, pressed && styles.pressed]}
              >
                <Text style={[typography.bodyMedium, styles.dark]}>붙여넣기</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.section}>
            <SectionLabel icon="link" label="링크" />
            <View>
              <TextInput
                accessibilityLabel="링크"
                value={link}
                onChangeText={setLink}
                placeholder="링크를 붙여 넣어 주세요"
                placeholderTextColor={colors.text.sub}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="done"
                style={[typography.body, styles.input, styles.linkInput]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="붙여넣기"
                hitSlop={4}
                onPress={() => void paste()}
                style={({ pressed }) => [styles.pasteButton, pressed && styles.pressed]}
              >
                <Icon name="copy" size={18} color={colors.text.icon} />
              </Pressable>
            </View>
            {unsupported ? (
              <View style={styles.errorLine} accessibilityLiveRegion="polite">
                <Icon name="alert" size={16} color={colors.status.danger} />
                <Text style={[typography.captionMedium, styles.danger]}>
                  이 형식에서는 장소를 찾을 수 없어요
                </Text>
              </View>
            ) : null}
          </View>

          {unsupported ? (
            <View style={styles.guide}>
              <Text style={[typography.captionMedium, styles.sub]}>이런 것을 넣어 주세요</Text>
              <View style={styles.guideRow}>
                <Icon name="link" size={20} color={colors.text.icon} />
                <Text style={[typography.body, styles.text]}>SNS 게시물, 블로그 글 링크</Text>
              </View>
              <View style={styles.guideRow}>
                <Icon name="image" size={20} color={colors.text.icon} />
                <Text style={[typography.body, styles.text]}>캡처 이미지 (JPG, PNG)</Text>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.section}>
                <SectionLabel
                  icon="image"
                  label="캡처"
                  right={captures.length > 0 ? `${captures.length}장` : undefined}
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.captures}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`캡처 추가, 최대 ${MAX_CAPTURES}장`}
                    onPress={() => void pick()}
                    style={({ pressed }) => [styles.addCapture, pressed && styles.pressed]}
                  >
                    <Icon name="plus" size={20} color={colors.text.icon} />
                    <Text style={[typography.captionMedium, styles.sub]}>추가</Text>
                  </Pressable>
                  {captures.map((c, i) => (
                    <View key={c.key} style={styles.thumb}>
                      <Image source={{ uri: c.uri }} style={styles.thumbImage} />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`캡처 ${i + 1} 빼기`}
                        hitSlop={8}
                        onPress={() => setCaptures((list) => list.filter((x) => x.key !== c.key))}
                        style={styles.removeCapture}
                      >
                        <Icon name="close" size={14} color={colors.text.inverse} />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.section}>
                <SectionLabel icon="pencil" label="메모" badge="선택" />
                <TextInput
                  accessibilityLabel="메모"
                  value={memo}
                  onChangeText={setMemo}
                  placeholder="예: 노을 질 때 가 보기"
                  placeholderTextColor={colors.text.sub}
                  maxLength={MEMO_MAX}
                  multiline
                  textAlignVertical="top"
                  style={[typography.body, styles.input, styles.memo]}
                />
              </View>
            </>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + spacing[12], 34) }]}>
          <Button
            label="장소 찾기"
            weight="medium"
            disabled={!ready}
            loading={start.isPending}
            onPress={find}
            leading={<Icon name="search" size={20} color={colors.text.inverse} />}
            style={ready ? styles.find : styles.findOff}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function SectionLabel({
  icon,
  label,
  right,
  badge,
}: {
  icon: IconName;
  label: string;
  right?: string;
  badge?: string;
}) {
  return (
    <View style={styles.labelRow}>
      <Icon name={icon} size={16} color={colors.text.icon} />
      <Text style={[typography.captionMedium, styles.sub]}>{label}</Text>
      {badge ? (
        <View style={styles.badge}>
          <Text style={[typography.captionMedium, styles.badgeText]}>{badge}</Text>
        </View>
      ) : null}
      {right ? <Text style={[typography.caption, styles.sub, styles.right]}>{right}</Text> : null}
    </View>
  );
}

const THUMB = 80;

const styles = StyleSheet.create({
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
  right: { marginLeft: 'auto' },
  badge: {
    marginLeft: spacing[4],
    paddingHorizontal: spacing[6],
    borderRadius: 6,
    backgroundColor: colors.surface.default,
  },
  badgeText: { color: colors.text.sub },
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
    paddingRight: 52,
    textAlignVertical: 'center',
  },
  pasteButton: {
    position: 'absolute',
    right: spacing[8],
    top: 8,
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.white,
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
    gap: spacing[2],
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: spacing[12],
    paddingHorizontal: layout.screenPaddingX,
  },
  find: { paddingLeft: spacing[20], paddingRight: spacing[24] },
  // 값 문서: 지원하지 않는 형식이면 흐림 0.32
  findOff: { paddingLeft: spacing[20], paddingRight: spacing[24], opacity: 0.32 },
  pressed: { opacity: 0.6 },
  text: { color: colors.text.default },
  sub: { color: colors.text.icon },
  dark: { color: colors.brand.primaryDark },
  danger: { color: colors.status.danger },
});
