/** 서버 공통 응답. 성공은 { data }, 실패는 { error } (docs/api-spec.md §1). */
export type DataResponse<T> = { data: T };

/** 목록 응답. 다음 페이지는 page.nextCursor를 cursor로 보낸다 (docs/api-spec.md §1) */
export type PageResponse<T> = { data: T[]; page: { nextCursor: string | null; hasNext: boolean } };

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string> | null;
    traceId?: string;
  };
};

export type FollowStatus = 'NONE' | 'REQUESTED' | 'ACCEPTED';

export type UserCard = {
  id: string;
  nickname: string;
  profileImageUrl: string | null;
  accountVisibility: 'PUBLIC' | 'PRIVATE';
  followingStatus: FollowStatus;
  followedByStatus: FollowStatus;
};

export type MyProfile = UserCard & {
  ageBand: string | null;
  ageUseConsent: boolean;
  /** false면 가입 대기. GET/PATCH /me 말고 다른 서비스 요청은 403 PROFILE_INCOMPLETE */
  profileCompleted: boolean;
  profileUrl: string;
};

export type Session = {
  accessToken: string;
  refreshToken: string;
  /** access 토큰 유효 시간(초) */
  expiresIn: number;
  user: MyProfile;
  isNewUser: boolean;
};
