import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Stagger } from '@/components/ui/stagger';
import { Avatar, Button, ConfirmSheet, ErrorState, Header, toast } from '@/components/ui';
import { SkeletonList } from '@/components/ui/skeleton';
import { signOut } from '@/features/auth/logout';
import {
  AiModeSelector,
  SettingsRow,
  SettingsSection,
  SettingsToggle,
} from '@/features/settings/components/settings-controls';
import { SettingsEditPreview } from '@/features/settings/components/settings-edit-preview';
import { useServerSettings } from '@/features/settings/hooks/use-server-settings';
import type { AiMode, SettingsData, UserSettings } from '@/features/settings/types';
import { KOREA_MAP_CREDIT } from '@/lib/korea-map';
import { KakaoSymbol } from '@/features/auth/components/kakao-symbol';
import { colors, layout, radius, size, spacing, typography } from '@/theme';

const AI_OPTIONS = [
  { value: 'AUTO', label: '자동' },
  { value: 'CONFIRM', label: '확인 후' },
  { value: 'OFF', label: '끄기' },
] as const;
const VISIT_OPTIONS = AI_OPTIONS.map((option) => ({
  ...option,
  disabled: option.value === 'AUTO',
}));
const WEATHER_OPTIONS = [
  { value: 'SUGGEST_ONLY', label: '제안만' },
  { value: 'OFF', label: '끄기' },
] as const;

type ViewProps = {
  data: SettingsData;
  pending: boolean;
  change: (
    update: (previous: SettingsData) => SettingsData,
    failureMessage: string,
    retry?: boolean,
  ) => void;
  /** 계정 공개/비공개 저장(PATCH /me). 미리보기에서는 없고 change로 화면 값만 바꾼다 */
  onAccountVisibility?: (next: 'PUBLIC' | 'PRIVATE') => void;
  /** /dev/settings 미리보기. 예시 값, 편집안 화면, 개발용 문구를 쓴다 */
  preview?: boolean;
  initialDetail?: 'preferences' | 'profile' | 'ai' | null;
  simulateFailure?: boolean;
  previewControls?: ReactNode;
};

/** S45 실제 화면. 내 정보·취향·AI·알림 설정을 서버에서 받는다. */
export function SettingsScreen() {
  const server = useServerSettings();
  if (!server.data) {
    return (
      <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
        <Header title="프로필과 설정" />
        {server.isError ? (
          <ErrorState title="설정을 불러오지 못했어요" onRetry={server.refetch} />
        ) : (
          <SkeletonList style={styles.screen} />
        )}
      </SafeAreaView>
    );
  }
  return (
    <SettingsView
      data={server.data}
      pending={server.pending}
      change={server.change}
      onAccountVisibility={server.changeAccountVisibility}
    />
  );
}

/** S45 화면 그리기. 값과 저장은 받은 data·change로만 다룬다. */
export function SettingsView({
  data,
  pending,
  change,
  onAccountVisibility,
  initialDetail = null,
  simulateFailure = false,
  preview = false,
  previewControls,
}: ViewProps) {
  const [detail, setDetail] = useState<'ai' | 'profile' | 'preferences' | null>(
    preview ? initialDetail : null,
  );
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutLock = useRef(false);
  const { profile, settings } = data;

  useEffect(() => {
    if (!detail) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setDetail(null);
      return true;
    });
    return () => subscription.remove();
  }, [detail]);

  function changeAi<K extends keyof UserSettings['ai']>(
    key: K,
    value: UserSettings['ai'][K],
    message = 'AI 설정을 바꾸지 못했어요',
  ) {
    change(
      (previous) => ({
        ...previous,
        settings: { ...previous.settings, ai: { ...previous.settings.ai, [key]: value } },
      }),
      message,
    );
  }

  function changeNotification(key: keyof UserSettings['notifications'], value: boolean) {
    change(
      (previous) => ({
        ...previous,
        settings: {
          ...previous.settings,
          notifications: { ...previous.settings.notifications, [key]: value },
        },
      }),
      '알림 설정을 바꾸지 못했어요',
    );
  }

  async function copyProfileLink() {
    try {
      const copied = await Clipboard.setStringAsync(profile.profileUrl);
      if (!copied) throw new Error('복사 실패');
      toast.success(preview ? '예시 프로필 링크를 복사했어요' : '프로필 링크를 복사했어요');
    } catch {
      toast.error('링크를 복사하지 못했어요');
    }
  }

  async function logout() {
    if (logoutLock.current) return;
    if (preview) {
      toast.show('미리보기에서는 로그아웃하지 않아요');
      return;
    }
    logoutLock.current = true;
    setLoggingOut(true);
    try {
      await signOut();
      router.replace('/');
    } catch {
      toast.error('로그아웃하지 못했어요. 다시 시도해 주세요');
    } finally {
      logoutLock.current = false;
      setLoggingOut(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      {detail === null ? (
        <>
          <Header title="프로필과 설정" />
          <ScrollView contentContainerStyle={styles.content}>
            <Stagger itemStyle={styles.staggerItem}>
              {previewControls}

              <View style={styles.profile}>
                <Avatar
                  name={profile.nickname}
                  imageUrl={profile.profileImageUrl}
                  size={size.button.xl}
                  me
                />
                <View style={styles.profileText}>
                  <Text style={styles.name}>{profile.nickname}</Text>
                  {data.handleLabel ? <Text style={styles.handle}>{data.handleLabel}</Text> : null}
                </View>
                <Button
                  label="링크 복사"
                  icon="copy"
                  size="sm"
                  variant="neutral"
                  onPress={copyProfileLink}
                />
              </View>
              <SettingsSection title="내 정보">
                <SettingsRow
                  icon="person"
                  label="프로필 수정"
                  onPress={() =>
                    preview
                      ? setDetail('profile')
                      : router.push({ pathname: '/profile', params: { from: 'settings' } })
                  }
                />
                <SettingsRow
                  icon="star"
                  label="여행 취향"
                  value={
                    data.preferences.length > 0 ? `${data.preferences.length}개 선택` : '선택 안 함'
                  }
                  onPress={() =>
                    preview
                      ? setDetail('preferences')
                      : router.push({ pathname: '/preferences', params: { from: 'settings' } })
                  }
                />
              </SettingsSection>
              <SettingsSection title="앱 설정">
                <SettingsRow icon="bulb" label="AI 기능 설정" onPress={() => setDetail('ai')} />
              </SettingsSection>
              <SettingsSection title="알림">
                <SettingsRow
                  icon="person"
                  label="팔로우 요청"
                  trailing={
                    <SettingsToggle
                      label="팔로우 요청 알림"
                      value={settings.notifications.followRequests}
                      disabled={pending}
                      onChange={(value) => changeNotification('followRequests', value)}
                    />
                  }
                />
                <SettingsRow
                  icon="people"
                  label="투표·코스 소식"
                  trailing={
                    <SettingsToggle
                      label="투표·코스 소식 알림"
                      value={settings.notifications.voteCourse}
                      disabled={pending}
                      onChange={(value) => changeNotification('voteCourse', value)}
                    />
                  }
                />
                <SettingsRow
                  icon="trip"
                  label="여행 소식"
                  description="동행 참여·여행 정보 변경"
                  trailing={
                    <SettingsToggle
                      label="여행 소식 알림"
                      value={settings.notifications.tripChanges}
                      disabled={pending}
                      onChange={(value) => changeNotification('tripChanges', value)}
                    />
                  }
                />
              </SettingsSection>
              <SettingsSection title="계정">
                <SettingsRow
                  icon="lock"
                  label="계정 공개"
                  description={
                    profile.accountVisibility === 'PUBLIC'
                      ? '누구나 내 공개 기록을 볼 수 있어요'
                      : '승인한 팔로워만 내 기록을 볼 수 있어요. 공개로 바꾸면 받은 팔로우 요청이 모두 수락돼요'
                  }
                  trailing={
                    <SettingsToggle
                      label="계정 공개"
                      value={profile.accountVisibility === 'PUBLIC'}
                      disabled={pending}
                      onChange={(value) => {
                        // 실제 화면은 PATCH /me로 저장한다. 설정(/me/settings)과 따로 저장된다
                        if (onAccountVisibility) {
                          onAccountVisibility(value ? 'PUBLIC' : 'PRIVATE');
                          return;
                        }
                        change(
                          (previous) => ({
                            ...previous,
                            profile: {
                              ...previous.profile,
                              accountVisibility: value ? 'PUBLIC' : 'PRIVATE',
                            },
                          }),
                          '공개 설정을 바꾸지 못했어요',
                        );
                      }}
                    />
                  }
                />

                <SettingsRow
                  icon="person"
                  label="로그인 계정"
                  trailing={
                    // 무엇으로 로그인했는지 글자 대신 기호로 보인다. 글자는 화면 읽어 주기가 읽는다
                    <View style={styles.provider} accessible accessibilityLabel={data.loginLabel}>
                      <KakaoSymbol size={16} />
                    </View>
                  }
                />
                <SettingsRow
                  icon="leave"
                  label={loggingOut ? '로그아웃 중…' : '로그아웃'}
                  disabled={loggingOut}
                  onPress={logout}
                  trailing={<View />}
                />
                <SettingsRow
                  icon="trash"
                  label="탈퇴"
                  danger
                  onPress={() => setWithdrawOpen(true)}
                  trailing={<View />}
                />
              </SettingsSection>
              {/* 지도 경계(공공누리 1유형)는 출처를 적어야 쓸 수 있다. 지도 위에서는 뺐으니 여기 맨 아래에 둔다 */}
              <Text style={styles.credit}>{KOREA_MAP_CREDIT}</Text>
            </Stagger>
          </ScrollView>
        </>
      ) : null}
      {preview && (detail === 'profile' || detail === 'preferences') ? (
        <SettingsEditPreview
          key={detail}
          kind={detail}
          data={data}
          simulateFailure={simulateFailure}
          onClose={() => setDetail(null)}
          onSave={(nickname, preferences, imageUrl) => {
            change(
              (previous) => ({
                ...previous,
                profile: { ...previous.profile, nickname, profileImageUrl: imageUrl },
                preferences,
              }),
              '저장하지 못했어요',
              true,
            );
            setDetail(null);
            toast.success('미리보기에 적용했어요');
          }}
        />
      ) : null}
      {detail === 'ai' ? (
        <View style={styles.screen}>
          <Header title="AI 기능 설정" onBack={() => setDetail(null)} />
          <ScrollView contentContainerStyle={styles.content}>
            <Stagger itemStyle={styles.staggerItem}>
              <Text style={styles.caption}>AI가 도와줄 일과 실행 방식을 선택해 주세요.</Text>
              <SettingsSection title="AI 기능">
                <AiModeSelector<AiMode>
                  label="사진 주제 분류와 묶음"
                  description="사진을 주제별로 나눠요"
                  icon="image"
                  value={settings.ai.photoClassification}
                  options={AI_OPTIONS}
                  disabled={pending}
                  onChange={(value) =>
                    changeAi(
                      'photoClassification',
                      value,
                      value === 'OFF' ? '분류를 끄지 못했어요' : '분류 설정을 바꾸지 못했어요',
                    )
                  }
                />
                <AiModeSelector<AiMode>
                  label="사진으로 방문 장소 찾기"
                  description="방문 기록은 직접 확인해야 해요. 자동 실행은 아직 지원하지 않아요"
                  icon="map-pin"
                  value={settings.ai.visitDetection}
                  options={VISIT_OPTIONS}
                  disabled={pending}
                  onChange={(value) => changeAi('visitDetection', value)}
                />
                <AiModeSelector<AiMode>
                  label="링크와 캡처에서 장소 찾기"
                  description="링크·캡처 속 장소를 찾아요"
                  icon="link"
                  value={settings.ai.placeExtraction}
                  options={AI_OPTIONS}
                  disabled={pending}
                  onChange={(value) => changeAi('placeExtraction', value)}
                />
                <AiModeSelector<AiMode>
                  label="준비물 제안"
                  description="날씨·일정 기준 준비물"
                  icon="trip"
                  value={settings.ai.checklist}
                  options={AI_OPTIONS}
                  disabled={pending}
                  onChange={(value) => changeAi('checklist', value)}
                />
                <AiModeSelector<UserSettings['ai']['weather']>
                  label="날씨 대안"
                  description="코스는 제안만 해요"
                  icon="bulb"
                  value={settings.ai.weather}
                  options={WEATHER_OPTIONS}
                  disabled={pending}
                  onChange={(value) => changeAi('weather', value)}
                />
              </SettingsSection>
            </Stagger>
          </ScrollView>
        </View>
      ) : null}
      <ConfirmSheet
        visible={withdrawOpen}
        title="어디로그를 탈퇴할까요?"
        description={'내 기록이 모두 지워져요.\n함께 만든 여행은 동행에게 남아요'}
        confirmLabel="탈퇴하기"
        onClose={() => setWithdrawOpen(false)}
        onConfirm={() => {
          setWithdrawOpen(false);
          // 탈퇴(DELETE /me)는 보존 정책(Q-11)이 정해진 뒤 연결한다
          toast.show('탈퇴는 곧 지원돼요');
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // 차례로 나타나는 구역을 감싼 칸. 한 구역이 여러 줄이면 그 사이 간격을 스크롤 내용과 같게 둔다
  staggerItem: { gap: spacing[28] },
  screen: { flex: 1, backgroundColor: colors.surface.white },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    paddingBottom: spacing[32] + spacing[8],
    gap: spacing[28],
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing[14],
    // 프로필은 파랑 카드(마이페이지와 같은 얼굴)
    padding: spacing[20],
    borderRadius: radius.xxl,
    backgroundColor: colors.brand.primary,
  },
  handle: { ...typography.caption, color: colors.onBrand.textSoft },
  provider: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.external.kakao,
  },
  profileText: { flex: 1 },
  name: { ...typography.title1, color: colors.text.inverse },
  caption: { ...typography.caption, color: colors.text.icon },
  copy: { backgroundColor: colors.surface.white, borderRadius: radius.full },
  preferences: { paddingVertical: spacing[12], gap: spacing[12] },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
  credit: { ...typography.caption, color: colors.text.muted, textAlign: 'center' },
});
