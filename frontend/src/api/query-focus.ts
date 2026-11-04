import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { AppState } from 'react-native';

/**
 * React Native에는 브라우저의 창 포커스·온라인 이벤트가 없다. 앱 상태와 연결 상태를 TanStack Query에 알려
 * 앱이 다시 앞으로 오면 오래된 데이터를 다시 받고, 연결이 돌아오면 멈춘 요청을 다시 보내게 한다.
 * 앱을 시작할 때 한 번 부른다. 다시 불러도 이전 구독을 바꿔 끼울 뿐이다.
 */
export function setupQueryFocus() {
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener('change', (state) => handleFocus(state === 'active'));
    return () => sub.remove();
  });

  onlineManager.setEventListener((setOnline) =>
    // 앱 시작 직후에는 isConnected가 null일 수 있다. 그때 오프라인으로 보면 첫 요청이 멈추므로 false일 때만 끊김으로 본다
    NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
  );
}
