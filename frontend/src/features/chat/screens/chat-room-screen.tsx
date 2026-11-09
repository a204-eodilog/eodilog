import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { useMe } from '@/hooks/use-me';

import { toChatItems } from '../chat-items';
import { CHAT_BANNER_STYLE, ChatRoomView, type ChatRoomStatus } from '../components/chat-room-view';
import { Composer } from '../components/composer';
import { ConnectionBanner } from '../components/connection-banner';
import { SystemCard } from '../components/system-card';
import { blockRoom } from '../hooks/block-room';
import { useRoomOutbox } from '../hooks/use-chat-outbox';
import { useChatRoom } from '../hooks/use-chat-room';
import { useMessages } from '../hooks/use-messages';
import { useSendMessage } from '../hooks/use-send-message';

/** S47 대화방. 채팅 탭(S46)과 여행 상세(S17)의 채팅 메뉴에서 들어온다 */
export function ChatRoomScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const chatRoom = useChatRoom(tripId);
  const room = chatRoom.room;
  const messages = useMessages(tripId, room?.id);
  const outbox = useRoomOutbox(room?.id);
  const { send, retry, discard } = useSendMessage(tripId, room?.id, {
    onBlocked: () => void blockRoom(queryClient, tripId),
  });

  const items = useMemo(
    () =>
      toChatItems(messages.window, outbox, {
        meId: me?.id ?? null,
        participants: room?.participants ?? [],
      }),
    [messages.window, outbox, me?.id, room?.participants],
  );

  let status: ChatRoomStatus = 'ready';
  if (chatRoom.blocked || messages.blocked) status = 'blocked';
  else if (chatRoom.isError || messages.isError) status = 'error';
  else if (chatRoom.isLoading || messages.isLoading) status = 'loading';

  return (
    <ChatRoomView
      title={chatRoom.title}
      memberCount={room?.participants.length ?? null}
      status={status}
      items={items}
      hasOlder={messages.window?.hasOlder ?? false}
      olderState={messages.olderState}
      onLoadOlder={messages.loadOlder}
      onRetry={() => (chatRoom.isError ? chatRoom.refetch() : messages.refetch())}
      onResend={retry}
      onDiscard={discard}
      renderSystem={(item) => <SystemCard message={item.message} tripId={tripId} />}
      banner={<ConnectionBanner style={CHAT_BANNER_STYLE} />}
      composer={<Composer onSend={send} disabled={!room} />}
      onLeaveBlocked={() => {
        // 뒤로 가기로 차단된 방에 돌아오지 않게 쌓인 화면을 닫고 채팅 탭으로 간다
        if (router.canDismiss()) router.dismissAll();
        router.navigate('/chats');
      }}
    />
  );
}
