/** 내 대화방 전부(S46). 커서를 끝까지 받아 하나로 합친다 */
export const CHAT_ROOMS_KEY = ['chat', 'rooms'] as const;

// 아래 두 키는 ['trips', tripId] 아래에 둔다. 나가기·삭제·차단 때 forgetTrip이 여행 캐시와 함께 지운다(research R6)

/** 그 여행의 대화방(S47) */
export const chatRoomKey = (tripId: string) => ['trips', tripId, 'chat-room'] as const;

/** 그 여행 대화방의 메시지 창(MessageWindow) */
export const chatMessagesKey = (tripId: string) => ['trips', tripId, 'chat-messages'] as const;
