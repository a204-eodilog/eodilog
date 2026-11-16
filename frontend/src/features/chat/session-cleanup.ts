import { useChatReads } from './chat-reads';
import { useChatBlocked } from './hooks/use-chat-blocked';
import { useChatOutbox } from './hooks/use-chat-outbox';
import { clearRoomIndex } from './room-index';
import { stopChatSync } from './sync-session';

/**
 * 로그아웃 때 이 기기의 채팅 상태(받기·보내기 세션, 방 표, 보내는 중 메시지, 차단 표시)를 지운다. 세션 저장소가 부른다.
 * 세션은 여기서 먼저 멈춘다. 실시간 정리(startChatRealtime)는 화면이 다시 그려진 뒤에 돌아서, 그사이 도착한 응답이
 * 비운 캐시를 다시 채우지 않게 한다. 서버 데이터 캐시는 로그아웃의 queryClient.clear()가 지운다.
 * 이 파일은 src/realtime을 불러오지 않는다
 */
export function clearChatSession() {
  stopChatSync();
  clearRoomIndex();
  useChatOutbox.getState().clearAll();
  useChatBlocked.getState().clearAll();
  useChatReads.getState().clearAll();
}
