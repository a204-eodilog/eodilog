import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { hasErrorCode, API_ERROR } from '@/api/errors';
import type { MyProfile } from '@/api/types';
import { toast } from '@/components/ui';
import { updateProfile } from '@/features/auth/api';
import { ageBandLabel } from '@/features/auth/profile-rules';
import { getPreferences, PREFERENCES_QUERY_KEY } from '@/features/preferences';
import { getSettings, patchSettings } from '@/features/settings/api';
import { settingsPatch } from '@/features/settings/settings-rules';
import type { SettingsData, UserSettings } from '@/features/settings/types';
import { ME_QUERY_KEY, useMe } from '@/hooks/use-me';

export const SETTINGS_QUERY_KEY = ['me', 'settings'] as const;

// 로그인은 카카오만 있고, 핸들은 명세에 없어 보여 주지 않는다
const LOGIN_LABEL = '카카오로 로그인';

/**
 * S45 실제 화면의 값. 내 정보(GET /me), 취향 개수(GET /me/preferences), AI·알림(GET /me/settings)을 합친다.
 * 바꾸면 화면에 먼저 반영하고, 실패하면 이전 값으로 돌린 뒤 [다시 시도] 토스트를 띄운다.
 */
export function useServerSettings() {
  const queryClient = useQueryClient();
  const me = useMe();
  const settings = useQuery({ queryKey: SETTINGS_QUERY_KEY, queryFn: getSettings });
  const preferences = useQuery({
    queryKey: PREFERENCES_QUERY_KEY,
    queryFn: getPreferences,
    retry: false,
  });

  // 서버가 마지막으로 확인해 준 값과, 지금 보내는 중인지.
  // 저장하는 동안 스위치를 잠그면 연달아 누를 때 두 번째가 씹히고 스위치가 되돌아가 버벅여 보인다.
  // 그래서 화면은 누르는 대로 바로 바꾸고, 서버에는 하나씩 차례로 보낸다
  const confirmed = useRef<UserSettings | null>(null);
  const saving = useRef(false);
  const visibility = useMutation({
    mutationFn: (next: MyProfile['accountVisibility']) =>
      updateProfile({ accountVisibility: next }),
  });

  /** 계정 공개/비공개. 먼저 화면을 바꾸고, 실패하면 되돌린다 */
  function changeAccountVisibility(next: MyProfile['accountVisibility']) {
    const previous = queryClient.getQueryData<MyProfile>(ME_QUERY_KEY);
    if (!previous || visibility.isPending || previous.accountVisibility === next) return;
    queryClient.setQueryData<MyProfile>(ME_QUERY_KEY, { ...previous, accountVisibility: next });
    visibility.mutate(next, {
      onSuccess: (saved) => {
        queryClient.setQueryData<MyProfile>(ME_QUERY_KEY, saved);
        // 공개로 바꾸면 서버가 받은 팔로우 요청을 모두 수락한다
        void queryClient.invalidateQueries({ queryKey: ['friends'] });
      },
      onError: () => {
        queryClient.setQueryData<MyProfile>(ME_QUERY_KEY, previous);
        toast.error('공개 설정을 바꾸지 못했어요', {
          action: { label: '다시 시도', onPress: () => changeAccountVisibility(next) },
        });
      },
    });
  }

  const data: SettingsData | undefined =
    me.data && settings.data
      ? {
          profile: {
            id: me.data.id,
            nickname: me.data.nickname,
            profileImageUrl: me.data.profileImageUrl,
            ageBand: ageBandLabel(me.data.ageBand),
            accountVisibility: me.data.accountVisibility,
            profileUrl: me.data.profileUrl,
          },
          settings: settings.data,
          // 취향을 못 불러와도 설정은 쓸 수 있게 0개로 본다
          preferences: preferences.data?.explicitItems.map((item) => item.value) ?? [],
          handleLabel: null,
          loginLabel: LOGIN_LABEL,
        }
      : undefined;

  function change(update: (previous: SettingsData) => SettingsData, failureMessage: string) {
    const current = queryClient.getQueryData<UserSettings>(SETTINGS_QUERY_KEY);
    if (!data || !current) return;
    const next = update({ ...data, settings: current }).settings;
    if (!settingsPatch(current, next)) return;
    // 보내는 중이 아니면 지금 값이 서버 값이다
    if (!saving.current) confirmed.current = current;
    queryClient.setQueryData(SETTINGS_QUERY_KEY, next);
    void flush(() => change(update, failureMessage), failureMessage);
  }

  /** 화면 값과 서버 값이 같아질 때까지 하나씩 보낸다. 보내는 동안 또 바뀌면 끝난 뒤 이어서 보낸다 */
  async function flush(retry: () => void, failureMessage: string) {
    if (saving.current) return;
    saving.current = true;
    try {
      for (;;) {
        const base = confirmed.current;
        const wanted = queryClient.getQueryData<UserSettings>(SETTINGS_QUERY_KEY);
        const body = base && wanted ? settingsPatch(base, wanted) : null;
        if (!body) return;
        const saved = await patchSettings(body);
        confirmed.current = saved;
        // 그 사이 화면에서 더 바꾼 값은 남기고 버전만 서버 것으로 맞춘다
        const latest = queryClient.getQueryData<UserSettings>(SETTINGS_QUERY_KEY);
        queryClient.setQueryData(
          SETTINGS_QUERY_KEY,
          latest ? { ...latest, version: saved.version } : saved,
        );
      }
    } catch (error) {
      if (hasErrorCode(error, API_ERROR.VERSION_CONFLICT)) {
        // 다른 기기에서 먼저 바뀌었다. 되돌리지 말고 서버 값을 다시 받는다
        void queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
        toast.error('설정이 바뀌어 다시 불러왔어요');
        return;
      }
      if (confirmed.current) queryClient.setQueryData(SETTINGS_QUERY_KEY, confirmed.current);
      toast.error(failureMessage, { action: { label: '다시 시도', onPress: retry } });
    } finally {
      saving.current = false;
    }
  }

  return {
    data,
    // 설정 스위치는 저장 중에도 잠그지 않는다. 공개 설정만 답을 기다린다
    pending: visibility.isPending,
    change,
    changeAccountVisibility,
    isPending: me.isPending || settings.isPending,
    isError: me.isError || settings.isError,
    refetch: () => {
      void me.refetch();
      void settings.refetch();
      void preferences.refetch();
    },
  };
}
