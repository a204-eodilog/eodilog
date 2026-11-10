import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { hasErrorCode, API_ERROR } from '@/api/errors';
import type { MyProfile } from '@/api/types';
import { toast } from '@/components/ui';
import { updateProfile } from '@/features/auth/api';
import { ageBandLabel } from '@/features/auth/profile-rules';
import { getPreferences, PREFERENCES_QUERY_KEY } from '@/features/preferences';
import { getSettings, patchSettings } from '@/features/settings/api';
import { settingsPatch } from '@/features/settings/settings-rules';
import type { SettingsData } from '@/features/settings/types';
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

  const save = useMutation({ mutationFn: patchSettings });
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
    if (!data || save.isPending) return;
    const previous = data.settings;
    const next = update(data).settings;
    const body = settingsPatch(previous, next);
    if (!body) return;
    queryClient.setQueryData(SETTINGS_QUERY_KEY, next);
    save.mutate(body, {
      onSuccess: (saved) => queryClient.setQueryData(SETTINGS_QUERY_KEY, saved),
      onError: (error) => {
        if (hasErrorCode(error, API_ERROR.VERSION_CONFLICT)) {
          // 다른 기기에서 먼저 바뀌었다. 되돌리지 말고 서버 값을 다시 받는다
          void queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
          toast.error('설정이 바뀌어 다시 불러왔어요');
          return;
        }
        queryClient.setQueryData(SETTINGS_QUERY_KEY, previous);
        toast.error(failureMessage, {
          action: { label: '다시 시도', onPress: () => change(update, failureMessage) },
        });
      },
    });
  }

  return {
    data,
    pending: save.isPending || visibility.isPending,
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
