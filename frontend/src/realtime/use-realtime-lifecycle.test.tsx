import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { useSessionStore } from '@/stores/session-store';

import NetInfo from '@react-native-community/netinfo';

import { realtime } from './instance';
import { useRealtimeLifecycle } from './use-realtime-lifecycle';

jest.mock('@/config/env', () => ({
  env: { appEnv: 'local', apiBaseUrl: 'http://test', kakaoRedirectUri: null, devMock: false },
}));
jest.mock('./instance', () => ({
  realtime: {
    start: jest.fn(),
    stop: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    setOnline: jest.fn(),
    networkChanged: jest.fn(),
  },
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => () => undefined) },
}));

describe('실시간 생명주기', () => {
  it('로그인하면 연결하고, 로그아웃 상태가 되면 연결을 멈춘다', async () => {
    await act(async () => useSessionStore.setState({ status: 'signedIn' }));
    await renderHook(() => useRealtimeLifecycle());
    expect(realtime.start).toHaveBeenCalledTimes(1);
    await act(async () => useSessionStore.setState({ status: 'signedOut' }));
    expect(realtime.stop).toHaveBeenCalledTimes(1);
  });
});

describe('네트워크 전환', () => {
  it('인터넷이 계속 있어도 와이파이→LTE로 바뀌면 새로 연결하게 하고, 처음 상태나 같은 네트워크면 하지 않는다', async () => {
    await renderHook(() => useRealtimeLifecycle());
    const listener = jest.mocked(NetInfo.addEventListener).mock.calls.at(-1)![0] as (
      s: unknown,
    ) => void;
    const wifi = { isConnected: true, type: 'wifi', details: { ipAddress: '192.168.0.2' } };
    const lte = { isConnected: true, type: 'cellular', details: null };
    await act(async () => listener(wifi));
    await act(async () => listener(wifi));
    expect(realtime.networkChanged).not.toHaveBeenCalled();
    await act(async () => listener(lte));
    expect(realtime.networkChanged).toHaveBeenCalledTimes(1);
  });

  it('끊김(isConnected false)은 네트워크 전환으로 보지 않는다(돌아올 때 setOnline이 새로 붙인다)', async () => {
    jest.mocked(realtime.networkChanged).mockClear();
    await renderHook(() => useRealtimeLifecycle());
    const listener = jest.mocked(NetInfo.addEventListener).mock.calls.at(-1)![0] as (
      s: unknown,
    ) => void;
    await act(async () => listener({ isConnected: true, type: 'wifi', details: null }));
    await act(async () => listener({ isConnected: false, type: 'none', details: null }));
    await act(async () => listener({ isConnected: true, type: 'wifi', details: null }));
    expect(realtime.networkChanged).not.toHaveBeenCalled();
  });
});
