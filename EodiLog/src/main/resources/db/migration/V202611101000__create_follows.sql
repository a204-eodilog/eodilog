-- 방향별 팔로우 관계(명세 §3). 반대 방향은 별도 행이며 서로 영향을 주지 않는다
CREATE TABLE follows (
    id uuid PRIMARY KEY,
    follower_user_id uuid NOT NULL REFERENCES users (id),
    followee_user_id uuid NOT NULL REFERENCES users (id),
    status varchar(16) NOT NULL CHECK (status IN ('REQUESTED', 'ACCEPTED')),
    requested_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    CONSTRAINT follows_pair_unique UNIQUE (follower_user_id, followee_user_id),
    CONSTRAINT follows_not_self CHECK (follower_user_id <> followee_user_id),
    CONSTRAINT follows_accepted_at CHECK ((status = 'ACCEPTED') = (accepted_at IS NOT NULL))
);

CREATE INDEX follows_followee_status ON follows (followee_user_id, status);
