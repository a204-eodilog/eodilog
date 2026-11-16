import { create } from 'zustand';

import { DEV_MOCK_TOKENS } from '@/api/dev-mock';
import { queryClient } from '@/api/query-client';
import type { Session } from '@/api/types';
import { env } from '@/config/env';
import { clearChatSession } from '@/features/chat/session-cleanup';
import { clearInviteLinks } from '@/features/trip/invite-storage';
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
      // 신규 가입자 모드는 처음 화면부터 시작한다
      if (env.devMockNewUser) set({ status: 'signedOut', landingSeen: false });
      else set({ ...DEV_MOCK_TOKENS, status: 'signedIn', landingSeen: true });
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

  /**
   * 로그아웃의 모든 정리를 여기 한 곳에서 한다(2026-11-09). 로그아웃 버튼(signOut)과 토큰 만료 자동 로그아웃이 둘 다 거친다.
   * 예전에는 캐시 비우기가 로그아웃 버튼 쪽에만 있어, 토큰 만료로 나간 뒤 다른 계정으로 로그인하면 이전 사용자의
   * 내 정보·여행 목록·채팅이 남았다. 또 채팅 정리가 기기 저장소를 지우는 await 뒤에 있어, 그사이 도착한 채팅 응답이
   * 비운 캐시를 다시 채웠다. 그래서 기다림 없이 먼저 로그아웃 상태로 바꾸고 → 캐시와 채팅을 비운 뒤 → 기기 저장소를 지운다
   */
  clearSession: async (options) => {
    set({
      accessToken: null,
      refreshToken: null,
      status: 'signedOut',
      expired: options?.expired ?? false,
    });
    // 서버 데이터 캐시(내 정보·여행·채팅 등)를 비운다
    queryClient.clear();
    // 채팅 받기·보내기를 멈추고 이 기기의 채팅 상태(방 표·보내는 중 메시지)를 지운다(채팅 명세 FR-031).
    // 실시간 연결은 여기서 끊지 않는다. 생명주기 훅이 로그인 상태를 보고 끊는다(순환 import 방지)
    clearChatSession();
    // 저장소 삭제가 실패해도 화면에서는 이미 로그아웃 상태다
    await persist(null).catch(() => undefined);
    // 이 기기에 남긴 초대 링크도 지운다(동행 초대 명세 FR-033)
    await clearInviteLinks().catch(() => undefined);
  },

  dismissExpired: () => set({ expired: false }),

  markLandingSeen: async () => {
    set({ landingSeen: true });
    await secureStorage.set(LANDING_KEY, '1').catch(() => undefined);
  },

  setPendingInvite: (token) => set({ pendingInviteToken: token }),
}));
