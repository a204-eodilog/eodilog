import type { StateStorage } from 'zustand/middleware';

/** jest처럼 네이티브 모듈이 없는 곳에서 쓰는 메모리 저장소 */
function memoryStorage(): StateStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/**
 * 보내는 중 메시지를 기기에 둔다(2026-11-06). 앱을 완전히 껐다 켜도 못 보낸 메시지를 이어서 보내기 위해서다.
 * 팀 기술 스택(docs/plan/frontend-tech-stack) "토큰 외 저장은 react-native-mmkv"를 따른다. 서버·로컬 DB는 쓰지 않는다.
 * MMKV는 네이티브 모듈이라 jest에서는 불러올 수 없어 메모리로 대신한다
 */
export function createChatStorage(id: string): StateStorage {
  try {
    // 네이티브 모듈이 없으면 불러오는 순간 오류가 나므로 여기서 불러온다
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
    const mmkv = createMMKV({ id });
    return {
      getItem: (key) => mmkv.getString(key) ?? null,
      setItem: (key, value) => mmkv.set(key, value),
      removeItem: (key) => {
        mmkv.remove(key);
      },
    };
  } catch {
    return memoryStorage();
  }
}

/** 보내는 중 메시지 저장소 */
export function createOutboxStorage(): StateStorage {
  return createChatStorage('chat-outbox');
}
