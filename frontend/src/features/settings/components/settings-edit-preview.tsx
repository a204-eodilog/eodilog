import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Header, Icon, TextField, toast } from '@/components/ui';
import { PressableScale } from '@/components/ui/pressable-scale';
import {
  addKeyword,
  KEYWORD_MAX_LENGTH,
  MAX_PREFERENCES,
  SUGGESTED_KEYWORDS,
  ChosenChip,
  SuggestChip,
} from '@/features/preferences';
import type { SettingsData } from '@/features/settings/types';
import { colors, layout, radius, size, spacing, typography } from '@/theme';

type Props = {
  kind: 'profile' | 'preferences';
  data: SettingsData;
  simulateFailure: boolean;
  onClose: () => void;
  onSave: (nickname: string, preferences: string[], imageUrl: string | null) => void;
};

/** 서버 없는 개발 미리보기 전용. 실제 가입·취향 화면을 대체하지 않는다. */
export function SettingsEditPreview({ kind, data, simulateFailure, onClose, onSave }: Props) {
  const [nickname, setNickname] = useState(data.profile.nickname);
  const [preferences, setPreferences] = useState(data.preferences);
  const [imageUrl, setImageUrl] = useState(data.profile.profileImageUrl);
  const [failed, setFailed] = useState(false);
  const isProfile = kind === 'profile';
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string>();
  const suggestions = SUGGESTED_KEYWORDS.filter(
    (word) => !preferences.some((selected) => selected.toLowerCase() === word.toLowerCase()),
  );
  function add(word: string) {
    const result = addKeyword(preferences, word);
    if (!result.ok) {
      const messages = {
        empty: '취향을 1~20자로 입력해 주세요',
        duplicate: '이미 선택한 취향이에요',
        full: '취향은 20개까지 선택할 수 있어요',
      };
      setDraftError(messages[result.reason]);
      return false;
    }
    setPreferences(result.keywords);
    setDraftError(undefined);
    return true;
  }
  function addDraft() {
    if (add(draft)) setDraft('');
  }
  const valid = nickname.trim().length > 0 && nickname.trim().length <= 50;

  function save() {
    if (isProfile && !valid) return;
    if (simulateFailure && !failed) {
      setFailed(true);
      return;
    }
    onSave(nickname.trim(), preferences, imageUrl);
  }

  async function pickPhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) setImageUrl(result.assets[0].uri);
    } catch {
      toast.error('사진을 불러오지 못했어요');
    }
  }

  return (
    <View style={styles.screen}>
      <Header title={isProfile ? '프로필 수정' : '여행 취향'} onBack={onClose} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {failed ? (
          <Text accessibilityRole="alert" style={styles.error}>
            저장하지 못했어요. 다시 시도해 주세요.
          </Text>
        ) : null}
        {isProfile ? (
          <>
            <View style={styles.photoBlock}>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="프로필 사진 변경"
                onPress={pickPhoto}
                style={styles.photoButton}
              >
                <Avatar
                  name={nickname || data.profile.nickname}
                  imageUrl={imageUrl}
                  size={size.button.xl + size.avatar.lg}
                  me
                />
                <View style={styles.camera}>
                  <Icon name="camera" size={size.icon.md} color={colors.text.inverse} />
                </View>
              </PressableScale>
              <PressableScale
                accessibilityRole="button"
                onPress={pickPhoto}
                style={styles.photoLabel}
              >
                <Text style={styles.photoLabelText}>사진 변경</Text>
              </PressableScale>
            </View>
            <TextField
              label="닉네임"
              accessibilityLabel="닉네임"
              value={nickname}
              onChangeText={setNickname}
              maxLength={50}
              variant="filled"
              error={!valid ? '닉네임을 1~50자로 입력해 주세요' : undefined}
            />
            <View style={styles.ageRow}>
              <Text style={styles.caption}>연령대</Text>
              <Text style={styles.ageValue}>{data.profile.ageBand ?? '선택 안 함'}</Text>
              <Text style={styles.caption}>비공개</Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.inputSection}>
              <Text style={styles.title}>어떤 여행을 좋아하세요?</Text>
              <View style={styles.addRow}>
                <View style={styles.input}>
                  <TextField
                    value={draft}
                    onChangeText={(value) => {
                      setDraft(value);
                      setDraftError(undefined);
                    }}
                    variant="filled"
                    placeholder="직접 입력 (예: 온천, 전시)"
                    accessibilityLabel="취향 직접 입력"
                    maxLength={KEYWORD_MAX_LENGTH}
                    hideCount
                    error={draftError}
                    onSubmitEditing={addDraft}
                    returnKeyType="done"
                  />
                </View>
                <Button label="추가" variant="neutral" onPress={addDraft} />
              </View>
            </View>
            <View style={styles.section}>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>내 취향</Text>
                <Text style={styles.caption}>
                  {preferences.length}/{MAX_PREFERENCES}
                </Text>
              </View>
              {preferences.length ? (
                <View style={styles.chips}>
                  {preferences.map((word) => (
                    <ChosenChip
                      key={word}
                      label={word}
                      onRemove={() => {
                        setPreferences((current) => current.filter((item) => item !== word));
                        setDraftError(undefined);
                      }}
                    />
                  ))}
                </View>
              ) : (
                <Text style={styles.caption}>취향을 직접 입력하거나 아래에서 골라 주세요.</Text>
              )}
            </View>
            {suggestions.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>이런 취향은 어때요?</Text>
                <View style={styles.chips}>
                  {suggestions.map((word) => (
                    <SuggestChip key={word} label={word} onAdd={() => add(word)} />
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <Button
          label={failed ? '다시 시도' : '저장'}
          disabled={isProfile && !valid}
          onPress={save}
          block
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.white },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[32],
    paddingBottom: spacing[32],
    gap: spacing[32],
  },
  photoBlock: { alignItems: 'center', paddingVertical: spacing[16] },
  photoButton: { position: 'relative' },
  camera: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: size.button.sm,
    height: size.button.sm,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.text.default,
  },
  photoLabel: {
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing[12],
  },
  photoLabelText: { ...typography.captionMedium, color: colors.text.icon },
  ageRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[12] },
  ageValue: { ...typography.bodyMedium, color: colors.text.default, flex: 1 },
  footer: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing[16],
    paddingBottom: spacing[20],
  },
  caption: { ...typography.caption, color: colors.text.icon },
  error: { ...typography.bodyMedium, color: colors.status.danger },
  title: { ...typography.title2, color: colors.text.default },
  inputSection: { gap: spacing[20] },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { gap: spacing[12] },
  sectionTitle: { ...typography.bodyBold, color: colors.text.default },
  addRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[8] },
  input: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
});
