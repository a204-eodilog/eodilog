-- 여행당 그룹 채팅방 하나(D-11). 여행 생성 때 함께 만든다
CREATE TABLE chat_rooms (
    id uuid PRIMARY KEY,
    trip_id uuid NOT NULL UNIQUE REFERENCES trips (id),
    next_sequence bigint NOT NULL DEFAULT 1 CHECK (next_sequence >= 1),
    created_at timestamp with time zone NOT NULL
);

-- 참여는 여행 멤버십과 같은 트랜잭션에서 맞춘다
CREATE TABLE chat_participants (
    room_id uuid NOT NULL REFERENCES chat_rooms (id),
    user_id uuid NOT NULL REFERENCES users (id),
    joined_at timestamp with time zone NOT NULL,
    left_at timestamp with time zone,
    -- 재참여 시 과거 대화 범위는 Q-13에서 정한다
    visible_from_sequence bigint NOT NULL DEFAULT 1 CHECK (visible_from_sequence >= 1),
    PRIMARY KEY (room_id, user_id)
);

CREATE INDEX idx_chat_participants_user_id ON chat_participants (user_id);
