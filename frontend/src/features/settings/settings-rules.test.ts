import { describe, expect, it } from '@jest/globals';

import { settingsPatch } from './settings-rules';
import type { UserSettings } from './types';

const base: UserSettings = {
  version: 3,
  ai: {
    photoClassification: 'CONFIRM',
    visitDetection: 'CONFIRM',
    placeExtraction: 'CONFIRM',
    checklist: 'CONFIRM',
    weather: 'SUGGEST_ONLY',
  },
  notifications: { followRequests: true, voteCourse: true, tripChanges: true },
};

describe('settingsPatch', () => {
  it('바꾼 AI 필드 하나만 현재 버전과 함께 보낸다', () => {
    const next = { ...base, ai: { ...base.ai, photoClassification: 'OFF' as const } };
    expect(settingsPatch(base, next)).toEqual({
      expectedVersion: 3,
      ai: { photoClassification: 'OFF' },
    });
  });

  it('알림만 바꾸면 ai는 보내지 않는다', () => {
    const next = { ...base, notifications: { ...base.notifications, voteCourse: false } };
    expect(settingsPatch(base, next)).toEqual({
      expectedVersion: 3,
      notifications: { voteCourse: false },
    });
  });

  it('바뀐 게 없으면 null', () => {
    expect(settingsPatch(base, { ...base, ai: { ...base.ai } })).toBeNull();
  });
});
