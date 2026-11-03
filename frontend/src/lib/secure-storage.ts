import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * 로그인 토큰처럼 기기에 안전하게 남겨야 하는 값.
 * 앱은 기기 보안 저장소(SecureStore)를 쓴다. 웹 미리보기에는 SecureStore가 없어 개발 확인용으로만 localStorage를 쓴다.
 */
const isWeb = Platform.OS === 'web';

function webStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export const secureStorage = {
  async get(key: string): Promise<string | null> {
    if (isWeb) return webStorage()?.getItem(key) ?? null;
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (isWeb) {
      webStorage()?.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (isWeb) {
      webStorage()?.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};
