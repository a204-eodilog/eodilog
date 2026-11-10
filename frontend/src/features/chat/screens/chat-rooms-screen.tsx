import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BANNER_STYLE, ChatRoomListView } from '../components/chat-room-list-view';
import { ConnectionBanner } from '../components/connection-banner';
import { chatRoomKey } from '../hooks/chat-keys';
import { useChatRooms, type ChatRoomRow } from '../hooks/use-chat-rooms';

/** S46 대화방 목록(채팅 탭) */
export function ChatRoomsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { featured, rows, meId, status, refetch, isRefetching } = useChatRooms();

  const open = (row: ChatRoomRow) => {
    // 목록에서 받은 방으로 미리 채워 S47이 방을 다시 받지 않고 바로 메시지를 부른다
    queryClient.setQueryData(chatRoomKey(row.room.tripId), row.room);
    router.push({ pathname: '/trips/[tripId]/chat', params: { tripId: row.room.tripId } });
  };

  return (
    <ChatRoomListView
      featured={featured}
      rows={rows}
      meId={meId}
      status={status}
      banner={<ConnectionBanner style={BANNER_STYLE} />}
      refreshing={isRefetching}
      onRefresh={() => refetch()}
      onRetry={() => refetch()}
      onOpen={open}
      onCreateTrip={() => router.push('/trips/new')}
      topInset={insets.top}
    />
  );
}
