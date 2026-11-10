import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
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
import { inviteHref } from '@/features/invitation/invite-rules';
import { assetSource } from '@/lib/asset-image';
import { useSessionStore } from '@/stores/session-store';
import { colors, layout, radius, spacing, typography } from '@/theme';

import { getMe, updateProfile } from '../api';
import { signOut } from '../logout';
import { ProfilePhotoError, uploadProfilePhoto } from '../profile-photo';
import {
  AGE_BANDS,
  type AgeBand,
  NICKNAME_MAX_LENGTH,
  normalizeNickname,
  photoContentType,
  type PickedPhoto,
  toAgeBand,
} from '../profile-rules';

/**
 * S02 프로필·연령 입력. 닉네임을 넣어 가입을 마친다.
 * 상태: 기본 / 필수 항목 누락 / 저장 실패. 연령대는 닉네임과 함께 저장한다(고르지 않으면 보내지 않음).
 * 프로필 사진은 고르면 미리 보이고 [다음]/[저장]을 눌러야 올라간다. 가입 대기 토큰으로는 올릴 수 없어
 * 닉네임 저장 → 사진 올리기 → 사진 저장 순서다. 사진만 실패하면 알리고 다음 화면으로 넘어간다(닉네임은 저장됨).
 * 저장 뒤에는 S03 취향 입력으로, 초대 링크로 왔으면 S04 초대 참여 확인으로 간다.
 * 주소는 (auth) 묶음 밖에 둔다. 가입을 마쳐 signedIn이 되는 순간 (auth) 레이아웃이 홈으로 보내 S03 이동과 겹치기 때문이다.
 * 피그마에는 없지만 가입 대기 중 다른 계정으로 바꿀 길이 없어 상단 오른쪽에 [로그아웃]을 둔다.
 * 설정에서 열면(from=settings) "프로필 수정": [저장] 후 설정으로 돌아가고, 취향 입력으로 넘어가지 않는다.
 * 저장에 실패하면 이 화면에 남아 다시 시도한다.
 */
export function ProfileScreen() {
  const markProfileCompleted = useSessionStore((s) => s.markProfileCompleted);
  const queryClient = useQueryClient();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const editing = from === 'settings';
  const me = useQuery({ queryKey: ['me'], queryFn: getMe });
  // null이면 아직 손대지 않은 것. 카카오에서 받은 닉네임이 있으면 그걸 보여 준다
  const [edited, setEdited] = useState<string | null>(null);
  const nickname = edited ?? me.data?.nickname ?? '';
  // undefined면 아직 손대지 않은 것. 서버에 저장된 연령대를 보여 준다
  const [ageEdited, setAgeEdited] = useState<AgeBand | null | undefined>(undefined);
  const age = ageEdited !== undefined ? ageEdited : toAgeBand(me.data?.ageBand);
  const [touched, setTouched] = useState(false);
  // 새로 고른 사진. 저장을 눌러야 올라간다. 없으면 서버에 저장된 사진을 보여 준다
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const photoSource = assetSource(photo?.uri ?? me.data?.profileImageUrl);

  const valid = normalizeNickname(nickname);
  const missing = touched && !valid;

  const pickPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      const picked = result.canceled ? null : result.assets[0];
      if (!picked) return;
      setPhoto({ uri: picked.uri, contentType: photoContentType(picked.uri, picked.mimeType) });
    } catch {
      toast.show('사진을 불러오지 못했어요');
    }
  };

  const save = useMutation({
    mutationFn: async (value: string) => {
      // 가입 대기 토큰으로는 사진을 올릴 수 없어 닉네임(+연령대)을 먼저 저장한다
      await updateProfile({
        nickname: value,
        // 손댄 경우에만 보낸다. null은 골랐던 연령대를 지운다
        ...(ageEdited !== undefined ? { ageBand: ageEdited } : {}),
      });
      if (!photo) return { photoMessage: null };
      try {
        const assetId = await uploadProfilePhoto(photo);
        await updateProfile({ profileImageAssetId: assetId });
        return { photoMessage: null };
      } catch (e) {
        // 닉네임은 이미 저장됐다. 사진만 실패했다고 알리고 다음으로 넘어간다
        return {
          photoMessage:
            e instanceof ProfilePhotoError
              ? e.message
              : '프로필 사진은 저장하지 못했어요. 프로필 수정에서 다시 넣어 주세요',
        };
      }
    },
    onSuccess: async ({ photoMessage }) => {
      if (photoMessage) toast.show(photoMessage);
      // 내 닉네임·사진은 마이페이지, 여행 동행, 채팅방 참여자, 친구 목록에도 들어 있어 모두 새로 받는다.
      // 처음 가입도 마찬가지다: 탭 화면이 미리 만들어져 마이페이지가 가입 전(닉네임 빈) 정보를 들고 있다.
      // 채팅 메시지는 이어 받기 규칙이 따로 있어 뺀다(보낸 사람 얼굴은 채팅방 참여자에서 온다)
      const refresh = queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[2] !== 'chat-messages',
      });
      if (editing) {
        await refresh;
        if (!photoMessage) toast.show('저장했어요');
        if (router.canGoBack()) router.back();
        else router.replace('/settings');
        return;
      }
      // 처음 가입은 새로 받기를 기다리지 않고 바로 넘어간다(미리 떠 있는 탭 화면들을 다 받을 때까지
      // S02 버튼이 돌며 멈춰 있지 않게). 실패해도 각 화면이 다시 받는다
      void refresh;
      await markProfileCompleted();
      // 초대 링크로 가입했으면 S04 초대 참여 확인, 아니면 S03 취향 입력
      const invite = useSessionStore.getState().pendingInviteToken;
      router.replace(invite ? inviteHref(invite, { first: true }) : '/preferences');
    },
  });

  const onNext = () => {
    setTouched(true);
    if (!valid) return;
    save.mutate(valid);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <Header
        title={editing ? '프로필 수정' : '프로필 만들기'}
        right={
          editing ? undefined : (
            <Pressable
              accessibilityRole="button"
              onPress={signOut}
              style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
            >
              <Text style={[typography.captionMedium, styles.sub]}>로그아웃</Text>
            </Pressable>
          )
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
              {photoSource ? (
                <Image
                  source={photoSource}
                  style={styles.photo}
                  contentFit="cover"
                  accessibilityLabel="프로필 사진"
                />
              ) : (
                <View style={styles.photo}>
                  <Icon name="person" size={40} color={colors.text.sub} />
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={photoSource ? '프로필 사진 바꾸기' : '프로필 사진 추가'}
                onPress={pickPhoto}
                disabled={save.isPending}
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
                  key={band.code}
                  label={band.label}
                  size="md"
                  selected={age === band.code}
                  onPress={() => setAgeEdited(age === band.code ? null : band.code)}
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
          {editing ? null : (
            <Text style={[typography.caption, styles.sub]}>
              나중에 마이페이지에서 바꿀 수 있어요
            </Text>
          )}
          <Button
            label={save.isError ? '다시 시도' : editing ? '저장' : '다음'}
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
