/** docs/api-spec.md의 UserSettings. 실제 요청은 API 연결 단계에 추가한다. */
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
