import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Chip, Header, Icon, Tag, TextField, toast } from '@/components/ui';
import { useSessionStore } from '@/stores/session-store';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { getMe, updateNickname } from '../api';
import { signOut } from '../logout';
import { AGE_BANDS, type AgeBand, NICKNAME_MAX_LENGTH, normalizeNickname } from '../profile-rules';

/**
 * S02 프로필·연령 입력. 닉네임을 넣어 가입을 마친다.
 * 상태: 기본 / 필수 항목 누락 / 저장 실패. 프로필 사진·연령대는 저장 API가 아직 없어 화면에서만 고른다.
 * 저장 뒤에는 S03 취향 입력으로 간다(초대로 온 경우 S04는 초대 화면 작업 때 붙인다).
 * 주소는 (auth) 묶음 밖에 둔다. 가입을 마쳐 signedIn이 되는 순간 (auth) 레이아웃이 홈으로 보내 S03 이동과 겹치기 때문이다.
 * 피그마에는 없지만 가입 대기 중 다른 계정으로 바꿀 길이 없어 상단 오른쪽에 [로그아웃]을 둔다.
 */
export function ProfileScreen() {
  const markProfileCompleted = useSessionStore((s) => s.markProfileCompleted);
  const me = useQuery({ queryKey: ['me'], queryFn: getMe });
  // null이면 아직 손대지 않은 것. 카카오에서 받은 닉네임이 있으면 그걸 보여 준다
  const [edited, setEdited] = useState<string | null>(null);
  const nickname = edited ?? me.data?.nickname ?? '';
  const [age, setAge] = useState<AgeBand | null>(null);
  const [touched, setTouched] = useState(false);

  const valid = normalizeNickname(nickname);
  const missing = touched && !valid;

  const save = useMutation({
    mutationFn: (value: string) => updateNickname(value),
    onSuccess: async () => {
      await markProfileCompleted();
      router.replace('/preferences');
    },
  });

  const onNext = () => {
    setTouched(true);
    if (!valid) return;
    save.mutate(valid);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Header
        title="프로필 만들기"
        right={
          <Pressable
            accessibilityRole="button"
            onPress={signOut}
            style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
          >
            <Text style={[typography.captionMedium, styles.sub]}>로그아웃</Text>
          </Pressable>
        }
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {save.isError ? (
            <Card variant="filled" rounded="xl" style={styles.failCard}>
              <View style={styles.failRow}>
                <View style={styles.failIcon}>
                  <Icon name="alert" size={22} color={colors.status.danger} />
                </View>
                <View style={styles.flex}>
                  <Text style={[typography.bodyBold, styles.text]}>프로필을 저장하지 못했어요</Text>
                  <Text style={[typography.caption, styles.sub]}>
                    저장하지 못했어요. 다시 눌러 주세요
                  </Text>
                </View>
              </View>
            </Card>
          ) : null}

          <View style={styles.photoBlock}>
            <View>
              <View style={styles.photo}>
                <Icon name="person" size={40} color={colors.text.sub} />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="프로필 사진 추가"
                onPress={() => toast.show('프로필 사진은 곧 넣을 수 있어요')}
                style={styles.photoButton}
              >
                <Icon name="camera" size={20} color={colors.text.inverse} />
              </Pressable>
            </View>
            <View style={styles.labelRow}>
              <Text style={[typography.caption, styles.sub]}>프로필 사진</Text>
              <Tag label="선택" />
            </View>
          </View>

          <TextField
            label="닉네임"
            required
            variant="filled"
            value={nickname}
            onChangeText={(v) => {
              setTouched(true);
              setEdited(v);
            }}
            maxLength={NICKNAME_MAX_LENGTH}
            placeholder="친구에게 보일 이름"
            helper="친구에게 보이는 이름이에요"
            error={missing ? '닉네임을 입력해 주세요' : undefined}
            autoFocus={!me.data?.nickname}
            returnKeyType="done"
            onSubmitEditing={onNext}
          />

          <View style={styles.section}>
            <View style={styles.labelRow}>
              <Text style={[typography.captionMedium, styles.sub]}>연령</Text>
              <Tag label="선택" />
            </View>
            <View style={styles.chips}>
              {AGE_BANDS.map((band) => (
                <Chip
                  key={band}
                  label={band}
                  size="md"
                  selected={age === band}
                  onPress={() => setAge((prev) => (prev === band ? null : band))}
                />
              ))}
            </View>
            <View style={styles.noteRow}>
              <Icon name="lock" size={16} color={colors.text.icon} />
              <Text style={[typography.caption, styles.sub]}>
                연령은 공개 프로필에 보이지 않아요
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.bottom}>
          <Text style={[typography.caption, styles.sub]}>나중에 마이페이지에서 바꿀 수 있어요</Text>
          <Button
            label={save.isError ? '다시 시도' : '다음'}
            size="xl"
            block
            loading={save.isPending}
            onPress={onNext}
            style={styles.nextButton}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const PHOTO_SIZE = 96;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingVertical: spacing[24],
    gap: spacing[28],
  },
  // 안내 상자(회색). 피그마 S02 저장 실패: 바탕 grey 98, 둥글기 20, 안쪽 20
  failCard: { gap: 0, padding: spacing[20], backgroundColor: colors.surface.subtle },
  logout: { paddingHorizontal: spacing[8], paddingVertical: spacing[12] },
  pressed: { opacity: 0.6 },
  failRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[14] },
  failIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surface.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBlock: { alignItems: 'center', gap: spacing[12] },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: radius.full,
    backgroundColor: colors.line.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoButton: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.text.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  section: { gap: spacing[12] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[10] },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[6] },
  bottom: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[12],
    paddingBottom: spacing[24],
    gap: spacing[12],
  },
  nextButton: { borderRadius: radius.lg },
  text: { color: colors.text.default },
  sub: { color: colors.text.sub },
});
