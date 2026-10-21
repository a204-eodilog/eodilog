import { create } from 'zustand';

type SessionState = {
  accessToken: string | null;
  setAccessToken: (accessToken: string) => void;
  clearSession: () => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  accessToken: null,
  setAccessToken: (accessToken) => set({ accessToken }),
  clearSession: () => set({ accessToken: null }),
}));
