-- 여행별 단일 코스. 여행 생성 때 version 1의 빈 코스로 만든다
CREATE TABLE itineraries (
    id uuid PRIMARY KEY,
    trip_id uuid NOT NULL UNIQUE REFERENCES trips (id),
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    updated_by_member_id uuid NOT NULL REFERENCES trip_members (id),
    updated_at timestamp with time zone NOT NULL
);
