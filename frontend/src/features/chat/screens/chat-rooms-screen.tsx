import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOpenOnce } from '@/hooks/use-open-once';
import { usePullRefresh } from '@/hooks/use-pull-refresh';

import { BANNER_STYLE, ChatRoomListView } from '../components/chat-room-list-view';
import { ConnectionBanner } from '../components/connection-banner';
import { chatRoomKey } from '../hooks/chat-keys';
import { useChatRooms, type ChatRoomRow } from '../hooks/use-chat-rooms';

/** S46 대화방 목록(채팅 탭) */
export function ChatRoomsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { featured, rows, meId, status, refetch } = useChatRooms();
  // 다시 연결될 때마다 대화방 목록을 조용히 다시 받으므로, 표시는 사람이 당겼을 때만 켠다
  const pull = usePullRefresh(refetch);

  // 빠르게 두 번 눌러도 대화방은 한 번만 연다. 여는 동안에는 다른 방을 눌러도 받지 않는다
  const open = useOpenOnce((row: ChatRoomRow) => {
    // 목록에서 받은 방으로 미리 채워 S47이 방을 다시 받지 않고 바로 메시지를 부른다
    queryClient.setQueryData(chatRoomKey(row.room.tripId), row.room);
    router.push({ pathname: '/trips/[tripId]/chat', params: { tripId: row.room.tripId } });
  });

  return (
    <ChatRoomListView
      featured={featured}
      rows={rows}
      meId={meId}
      status={status}
      banner={<ConnectionBanner style={BANNER_STYLE} />}
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}
      onRetry={() => refetch()}
      onOpen={open}
      onCreateTrip={() => router.push('/trips/new')}
      topInset={insets.top}
    />
  );
}
