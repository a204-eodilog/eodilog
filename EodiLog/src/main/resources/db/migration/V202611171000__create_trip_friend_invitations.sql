-- 맞팔 친구에게 앱 안에서 보내는 여행 초대. 링크 초대(trip_invitations)와 따로 관리한다
-- 기간 만료는 저장하지 않고 status='PENDING' AND expires_at <= now로 계산한다
CREATE TABLE trip_friend_invitations (
    id uuid PRIMARY KEY,
    trip_id uuid NOT NULL REFERENCES trips (id),
    inviter_member_id uuid NOT NULL REFERENCES trip_members (id),
    invitee_user_id uuid NOT NULL REFERENCES users (id),
    status varchar(16) NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELED')),
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL,
    responded_at timestamp with time zone,
    CONSTRAINT ck_trip_friend_invitations_expires_at CHECK (expires_at > created_at),
    CONSTRAINT ck_trip_friend_invitations_responded CHECK ((status = 'PENDING') = (responded_at IS NULL))
);

-- 같은 여행·같은 사람에게 대기 초대는 하나다
CREATE UNIQUE INDEX uk_trip_friend_invitations_pending ON trip_friend_invitations (trip_id, invitee_user_id)
    WHERE status = 'PENDING';
CREATE INDEX idx_trip_friend_invitations_invitee ON trip_friend_invitations (invitee_user_id, status, created_at DESC);
CREATE INDEX idx_trip_friend_invitations_inviter_member ON trip_friend_invitations (inviter_member_id);
