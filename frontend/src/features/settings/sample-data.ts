import type { SettingsData } from '@/features/settings/types';

/** Figma S45 예시. 프로필 주소는 실제 사용자 주소가 아닌 예시 주소다. */
export const SAMPLE_SETTINGS: SettingsData = {
  profile: {
    id: 'sample-younggwang',
    nickname: '영광',
    profileImageUrl: null,
    ageBand: '20대',
    accountVisibility: 'PUBLIC',
    profileUrl: 'https://example.com/users/younggwang',
  },
  handleLabel: '@younggwang',
  loginLabel: '카카오로 로그인',
  preferences: ['바다', '맛집', '카페'],
  settings: {
    version: 1,
    ai: {
      photoClassification: 'CONFIRM',
      visitDetection: 'CONFIRM',
      placeExtraction: 'CONFIRM',
      checklist: 'CONFIRM',
      weather: 'SUGGEST_ONLY',
    },
    notifications: { followRequests: true, voteCourse: true, tripChanges: true },
  },
};
