-- 여행이 그룹의 경계다(D-3). 방장은 owner_user_id이며 같은 여행의 멤버여야 한다(서비스에서 보장)
CREATE TABLE trips (
    id uuid PRIMARY KEY,
    owner_user_id uuid NOT NULL REFERENCES users (id),
    title varchar(200) NOT NULL CHECK (btrim(title) <> ''),
    start_date date,
    end_date date,
    status varchar(16) NOT NULL DEFAULT 'PLANNING' CHECK (status IN ('PLANNING', 'ONGOING', 'COMPLETED')),
    currency varchar(3) NOT NULL DEFAULT 'KRW' CHECK (currency = 'KRW'),
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    expense_version bigint NOT NULL DEFAULT 0 CHECK (expense_version >= 0),
    -- settlements 테이블이 생길 때 FK를 추가한다
    current_settlement_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    -- 기간은 둘 다 있거나 둘 다 없다(P-1)
    CONSTRAINT ck_trips_period CHECK (
        (start_date IS NULL AND end_date IS NULL)
        OR (start_date IS NOT NULL AND end_date IS NOT NULL AND start_date <= end_date))
);

CREATE INDEX idx_trips_owner_user_id ON trips (owner_user_id);

-- 이탈해도 경비 FK 때문에 지우지 않는다. 재참여는 같은 행을 쓰고 join_order를 새로 받는다
CREATE TABLE trip_members (
    id uuid PRIMARY KEY,
    trip_id uuid NOT NULL REFERENCES trips (id),
    user_id uuid NOT NULL REFERENCES users (id),
    status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'LEFT', 'REMOVED')),
    join_order bigint NOT NULL CHECK (join_order >= 1),
    joined_at timestamp with time zone NOT NULL,
    left_at timestamp with time zone,
    preference_scope varchar(32) NOT NULL DEFAULT 'INHERIT'
        CHECK (preference_scope IN ('INHERIT', 'EXPLICIT_ONLY', 'EXPLICIT_AND_INFERRED', 'NONE')),
    CONSTRAINT uk_trip_members_trip_user UNIQUE (trip_id, user_id),
    CONSTRAINT uk_trip_members_trip_join_order UNIQUE (trip_id, join_order),
    CONSTRAINT ck_trip_members_left_at CHECK ((status = 'ACTIVE') = (left_at IS NULL))
);

CREATE INDEX idx_trip_members_user_status ON trip_members (user_id, status);
CREATE INDEX idx_trip_members_trip_status_join_order ON trip_members (trip_id, status, join_order);

-- display_order는 ERD에 없는 물리 컬럼으로, 사용자가 입력한 여행지 순서를 응답에서 유지하기 위해 둔다
CREATE TABLE trip_destinations (
    trip_id uuid NOT NULL REFERENCES trips (id),
    region_id uuid NOT NULL REFERENCES regions (id),
    display_order integer NOT NULL CHECK (display_order >= 0),
    -- poll_candidates 테이블이 생길 때 FK를 추가한다
    source_candidate_id uuid,
    PRIMARY KEY (trip_id, region_id),
    CONSTRAINT uk_trip_destinations_trip_display_order UNIQUE (trip_id, display_order)
);

CREATE INDEX idx_trip_destinations_region_id ON trip_destinations (region_id);
