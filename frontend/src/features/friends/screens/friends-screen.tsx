import { router } from 'expo-router';

import { FriendsView } from '@/features/friends/components/friends-view';
import { useFriends } from '@/features/friends/hooks/use-friends';

export function FriendsScreen() {
  const friends = useFriends();
  return (
    <FriendsView
      board={friends.board}
      loading={friends.isPending}
      error={friends.isError && !friends.data}
      retry={() => void friends.refetch()}
      pendingIds={friends.pendingIds}
      accepted={friends.accepted}
      onAction={friends.run}
      onPerson={(person) => router.push(`/users/${person.id}`)}
      onFind={() => router.push('/find-friends')}
    />
  );
}
