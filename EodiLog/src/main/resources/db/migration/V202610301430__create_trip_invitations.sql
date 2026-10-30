-- 여행 초대 링크. 토큰 원문은 생성 응답에서만 돌려주고 여기에는 SHA-256 해시만 남긴다(명세 §4)
-- 만료 7일·여행당 ACTIVE 멤버 20명은 서비스가 정한다(Q-4, 2026-10-30 결정). 링크별 사용 횟수는 두지 않는다
CREATE TABLE trip_invitations (
    id uuid PRIMARY KEY,
    trip_id uuid NOT NULL REFERENCES trips (id),
    created_by_member_id uuid NOT NULL REFERENCES trip_members (id),
    token_hash varchar(255) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT uk_trip_invitations_token_hash UNIQUE (token_hash),
    CONSTRAINT ck_trip_invitations_expires_at CHECK (expires_at > created_at)
);

CREATE INDEX idx_trip_invitations_trip_id ON trip_invitations (trip_id);
CREATE INDEX idx_trip_invitations_created_by_member_id ON trip_invitations (created_by_member_id);
