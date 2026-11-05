import { create } from 'zustand';

import { DEV_MOCK_TOKENS } from '@/api/dev-mock';
import type { Session } from '@/api/types';
import { env } from '@/config/env';
import { secureStorage } from '@/lib/secure-storage';

const STORAGE_KEY = 'eodilog.session';
const LANDING_KEY = 'eodilog.landingSeen';

/**
 * loading: 저장된 토큰을 읽는 중
 * signedOut: 로그인 안 함
 * pending: 로그인했지만 닉네임이 없어 가입 대기. S02로 보낸다
 * signedIn: 가입 완료
 */
export type SessionStatus = 'loading' | 'signedOut' | 'pending' | 'signedIn';

type StoredSession = {
  accessToken: string;
  refreshToken: string;
  profileCompleted: boolean;
};

type SessionState = {
  status: SessionStatus;
  accessToken: string | null;
  refreshToken: string | null;
  /** 갱신에 실패해 다시 로그인해야 할 때 true. 앱 어디서든 다시 로그인 안내 창을 띄운다 */
  expired: boolean;
  /** S00 랜딩을 본 적이 있으면 true. 첫 실행에만 랜딩을 보여 준다 */
  landingSeen: boolean;
  /**
   * 로그인 전에 연 초대 링크의 토큰. 로그인·가입을 마치면 S04 초대 참여 확인으로 이어 준다.
   * 기기에 남기지 않는다. 앱을 껐다 켜면 링크를 다시 열어야 한다
   */
  pendingInviteToken: string | null;
  /** 앱 시작 때 한 번. 기기에 남은 토큰으로 로그인 상태를 되살린다 */
  hydrate: () => Promise<void>;
  /** 로그인·갱신 성공. 두 토큰을 함께 바꿔 저장한다 */
  setSession: (session: Session) => Promise<void>;
  /** S02에서 닉네임을 저장해 가입을 마쳤을 때 */
  markProfileCompleted: () => Promise<void>;
  /** 로그아웃·갱신 실패. 기기의 토큰을 지운다 */
  clearSession: (options?: { expired?: boolean }) => Promise<void>;
  dismissExpired: () => void;
  markLandingSeen: () => Promise<void>;
  setPendingInvite: (token: string | null) => void;
};

async function persist(value: StoredSession | null) {
  if (value) await secureStorage.set(STORAGE_KEY, JSON.stringify(value));
  else await secureStorage.remove(STORAGE_KEY);
}

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'loading',
  accessToken: null,
  refreshToken: null,
  expired: false,
  landingSeen: false,
  pendingInviteToken: null,

  hydrate: async () => {
    // 개발용 테스트 모드: 로그인을 건너뛰고 가입을 마친 것으로 시작한다. 기기에는 저장하지 않는다
    if (env.devMock) {
      set({ ...DEV_MOCK_TOKENS, status: 'signedIn', landingSeen: true });
      return;
    }
    const landingSeen = (await secureStorage.get(LANDING_KEY).catch(() => null)) === '1';
    try {
      const raw = await secureStorage.get(STORAGE_KEY);
      const saved = raw ? (JSON.parse(raw) as StoredSession) : null;
      if (!saved?.accessToken || !saved.refreshToken) {
        set({ status: 'signedOut', landingSeen });
        return;
      }
      set({
        accessToken: saved.accessToken,
        refreshToken: saved.refreshToken,
        status: saved.profileCompleted ? 'signedIn' : 'pending',
        landingSeen,
      });
    } catch {
      // 저장 형식이 깨졌으면 로그인 안 한 상태로 시작한다
      await persist(null).catch(() => undefined);
      set({ status: 'signedOut', landingSeen });
    }
  },

  setSession: async ({ accessToken, refreshToken, user }) => {
    await persist({ accessToken, refreshToken, profileCompleted: user.profileCompleted });
    set({
      accessToken,
      refreshToken,
      expired: false,
      status: user.profileCompleted ? 'signedIn' : 'pending',
    });
  },

  markProfileCompleted: async () => {
    const { accessToken, refreshToken } = get();
    if (!accessToken || !refreshToken) return;
    await persist({ accessToken, refreshToken, profileCompleted: true });
    set({ status: 'signedIn' });
  },

  clearSession: async (options) => {
    // 저장소 삭제가 실패해도 화면에서는 로그아웃 상태로 만든다
    await persist(null).catch(() => undefined);
    set({
      accessToken: null,
      refreshToken: null,
      status: 'signedOut',
      expired: options?.expired ?? false,
    });
  },

  dismissExpired: () => set({ expired: false }),

  markLandingSeen: async () => {
    set({ landingSeen: true });
    await secureStorage.set(LANDING_KEY, '1').catch(() => undefined);
  },

  setPendingInvite: (token) => set({ pendingInviteToken: token }),
}));
