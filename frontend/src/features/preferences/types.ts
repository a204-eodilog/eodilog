/**
 * 취향 (docs/api-spec.md Preferences·PreferencesWrite, 결정 D-17).
 * explicitItems는 내가 직접 고른 것, inferredItems는 저장한 장소·행동으로 서버가 찾은 것이다.
 */
export type PreferenceItem = { key: string; value: string };

/** 추천에 내 취향을 쓰는 범위. 미설정은 NONE */
export type SharingScope = 'EXPLICIT_ONLY' | 'EXPLICIT_AND_INFERRED' | 'NONE';

export type Preferences = {
  explicitItems: PreferenceItem[];
  inferredItems: PreferenceItem[];
  allowInference: boolean;
  sharingScope: SharingScope;
  updatedAt: string;
};

export type PreferencesWrite = {
  explicitItems: PreferenceItem[];
  allowInference: boolean;
  sharingScope: SharingScope;
};

/** 여행별 추천 동의. INHERIT은 전역 sharingScope를 따른다 */
export type TripPreferenceScope = SharingScope | 'INHERIT';
