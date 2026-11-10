-- 친구 추천 숨김(명세 §3). 영구 유지하며 다시 추천하지 않는다. 검색·팔로우 자체는 막지 않는다
CREATE TABLE suggestion_dismissals (
    user_id uuid NOT NULL REFERENCES users (id),
    candidate_user_id uuid NOT NULL REFERENCES users (id),
    created_at timestamp with time zone NOT NULL,
    PRIMARY KEY (user_id, candidate_user_id),
    CONSTRAINT suggestion_dismissals_not_self CHECK (user_id <> candidate_user_id)
);
