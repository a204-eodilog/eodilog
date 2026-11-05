import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Button, toast } from '@/components/ui';
import { FriendsView } from '@/features/friends/components/friends-view';
import { applyFriendsAction } from '@/features/friends/friends-rules';
import { useFriends, type FriendsService } from '@/features/friends/hooks/use-friends';
import { PREVIEW_BOARD, PREVIEW_TRIPS } from '@/features/friends/preview-data';
import type { Follow, FriendsBoard } from '@/features/friends/types';
import { spacing } from '@/theme';

const STATES = [
  ['following', '기본'],
  ['followers', '팔로워'],
  ['empty', '친구 없음'],
  ['accepted', '수락 후'],
  ['confirm', '해제 확인'],
  ['failure', '수락 실패'],
  ['load-error', '조회 실패'],
] as const;
type State = (typeof STATES)[number][0];
const KEY = ['friends', 'preview'] as const;

function Preview({ state, onState }: { state: State; onState: (state: State) => void }) {
  const [service] = useState<FriendsService>(() => {
    let board: FriendsBoard =
      state === 'empty'
        ? { following: [], followers: [], requests: [] }
        : (JSON.parse(JSON.stringify(PREVIEW_BOARD)) as FriendsBoard);
    let failOnce = state === 'failure';
    let failLoad = state === 'load-error';
    if (state === 'accepted')
      board = applyFriendsAction(board, {
        kind: 'accept',
        follow: board.requests[0],
        at: '2026-11-18T00:00:00Z',
      });
    return {
      load: async () => {
        if (failLoad) {
          failLoad = false;
          throw new Error('조회 실패');
        }
        return JSON.parse(JSON.stringify(board)) as FriendsBoard;
      },
      execute: async (action) => {
        await new Promise((resolve) => setTimeout(resolve, 650));
        if (failOnce) {
          failOnce = false;
          throw new Error('저장 실패');
        }
        board = applyFriendsAction(board, action);
        return action.kind === 'accept'
          ? board.followers.find((f) => f.id === action.follow.id)
          : undefined;
      },
    };
  });
  const friends = useFriends(service, KEY);
  const triggered = useRef(false);
  useEffect(() => {
    if (state !== 'failure' || !friends.data || triggered.current) return;
    triggered.current = true;
    void friends.run({
      kind: 'accept',
      follow: friends.data.requests[0],
      at: '2026-11-18T00:00:00Z',
    });
  }, [state, friends]);
  const accepted: Follow | null =
    friends.accepted ??
    (state === 'accepted'
      ? (friends.board.followers.find((f) => f.id === 'request-1') ?? null)
      : null);
  return (
    <FriendsView
      board={friends.board}
      loading={friends.isPending}
      error={friends.isError}
      retry={() => void friends.refetch()}
      pendingIds={friends.pendingIds}
      accepted={accepted}
      onAction={friends.run}
      onPerson={() => toast.show('준비 중이에요')}
      onFind={() => toast.show('준비 중이에요')}
      previewTrips={PREVIEW_TRIPS}
      initialTab={state === 'followers' || state === 'accepted' ? 'followers' : 'following'}
      initialConfirm={state === 'confirm' ? PREVIEW_BOARD.following[4] : undefined}
      controls={
        <ScrollView horizontal style={styles.controls} contentContainerStyle={styles.buttons}>
          {STATES.map(([key, label]) => (
            <Button
              key={key}
              label={label}
              size="sm"
              variant={state === key ? 'secondary' : 'neutral'}
              onPress={() => onState(key)}
            />
          ))}
        </ScrollView>
      }
    />
  );
}

function PreviewSession({ state, onState }: { state: State; onState: (state: State) => void }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Infinity },
          mutations: { retry: false },
        },
      }),
  );
  useEffect(() => () => client.clear(), [client]);
  return (
    <QueryClientProvider client={client}>
      <Preview state={state} onState={onState} />
    </QueryClientProvider>
  );
}

export function FriendsPreviewScreen() {
  const params = useLocalSearchParams<{ state?: string }>();
  const [state, setState] = useState<State>(
    STATES.find(([key]) => key === params.state)?.[0] ?? 'following',
  );
  const [revision, setRevision] = useState(0);
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <PreviewSession
      key={state + revision}
      state={state}
      onState={(next) => {
        setState(next);
        setRevision((n) => n + 1);
      }}
    />
  );
}
const styles = StyleSheet.create({
  controls: { flexGrow: 0, flexShrink: 0 },
  buttons: { gap: spacing[8], paddingHorizontal: spacing[20], paddingVertical: spacing[8] },
});
