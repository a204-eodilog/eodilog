import { describe, expect, it, jest } from '@jest/globals';

import { sameStart } from './use-live-transcript';

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {},
  useSpeechRecognitionEvent: () => undefined,
}));

describe('sameStart', () => {
  it('같은 문장이 고쳐지는 중이면 이어 받는다', () => {
    expect(sameStart('부산 가려', '부산 가려고 해')).toBe(true);
    expect(sameStart('부산', '부 산에')).toBe(true);
  });
  it('쉬었다 새로 시작한 문장이면 앞 글을 확정한다', () => {
    expect(sameStart('부산 가려고 해', '첫날은 해운대')).toBe(false);
  });
});
