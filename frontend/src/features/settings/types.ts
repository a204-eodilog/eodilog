/** docs/api-spec.md의 UserSettings (GET·PATCH /me/settings) */
export type AiMode = 'AUTO' | 'CONFIRM' | 'OFF';
export type UserSettings = {
  version: number;
  ai: {
    photoClassification: AiMode;
    visitDetection: AiMode;
    placeExtraction: AiMode;
    checklist: AiMode;
    weather: 'SUGGEST_ONLY' | 'OFF';
  };
  notifications: {
    followRequests: boolean;
    voteCourse: boolean;
    tripChanges: boolean;
  };
};

/** PATCH /me/settings 요청. 생략한 필드는 그대로 둔다 */
export type SettingsPatch = {
  expectedVersion: number;
  ai?: Partial<UserSettings['ai']>;
  notifications?: Partial<UserSettings['notifications']>;
};

export type SettingsProfile = {
  id: string;
  nickname: string;
  profileImageUrl: string | null;
  ageBand: string | null;
  accountVisibility: 'PUBLIC' | 'PRIVATE';
  profileUrl: string;
};

/** 프로필·취향·설정 응답을 화면에서 쓰는 값으로 합치는 경계. */
export type SettingsData = {
  profile: SettingsProfile;
  settings: UserSettings;
  preferences: string[];
  // 핸들과 로그인 제공자 필드는 API 명세에 없어 표시용 값으로 분리한다.
  handleLabel: string | null;
  loginLabel: string;
};
