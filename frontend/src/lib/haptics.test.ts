import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Haptics from 'expo-haptics';

import { haptic } from './haptics';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('haptic', () => {
  it('다섯 가지가 저마다 다른 진동을 부른다', () => {
    haptic.light();
    expect(jest.mocked(Haptics.impactAsync).mock.calls[0][0]).toBe('light');
    haptic.select();
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    haptic.success();
    haptic.warning();
    haptic.error();
    expect(jest.mocked(Haptics.notificationAsync).mock.calls.map((c) => c[0])).toEqual([
      'success',
      'warning',
      'error',
    ]);
  });

  it('진동이 실패해도 던지지 않는다', () => {
    jest.mocked(Haptics.selectionAsync).mockRejectedValueOnce(new Error('no vibrator'));
    expect(() => haptic.select()).not.toThrow();
    jest.mocked(Haptics.impactAsync).mockImplementationOnce(() => {
      throw new Error('no module');
    });
    expect(() => haptic.light()).not.toThrow();
  });
});
