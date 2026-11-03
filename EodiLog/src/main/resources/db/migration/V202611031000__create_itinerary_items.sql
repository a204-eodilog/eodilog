-- 여행별 단일 코스의 항목과 구간(명세 §6, 정책 §13-3). 코스 행(itineraries)은 여행 생성 때 이미 있다
-- 일정 PUT은 전체 교체다. 요청에서 빠진 항목은 지우고, 남는 항목은 id를 유지한 채 날짜·순서를 바꾼다
CREATE TABLE itinerary_items (
    id uuid PRIMARY KEY,
    itinerary_id uuid NOT NULL REFERENCES itineraries (id),
    place_id uuid NOT NULL REFERENCES places (id),
    -- 여행 일차(1부터). 여행 기간이 있으면 일수 이하(C-3)
    day integer NOT NULL CHECK (day >= 1),
    -- 그 날짜 안의 순서(1부터 빈틈없이). API에서는 order로 부른다
    sequence integer NOT NULL CHECK (sequence >= 1),
    -- 현지 시각 HH:mm. 생략하면 null
    start_time varchar(5) CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    stay_minutes integer CHECK (stay_minutes BETWEEN 1 AND 1440),
    -- 전체 교체 중 남는 항목끼리 순서를 맞바꾸므로 커밋 때만 검사한다
    CONSTRAINT uk_itinerary_items_day_sequence UNIQUE (itinerary_id, day, sequence) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_itinerary_items_place_id ON itinerary_items (place_id);

-- 같은 날짜의 인접한 두 항목마다 구간 하나. 경로 공급자가 정해지기 전에는 이동 수단만 저장하고 결과는 비운다(C-5)
CREATE TABLE route_legs (
    id uuid PRIMARY KEY,
    itinerary_id uuid NOT NULL REFERENCES itineraries (id),
    from_item_id uuid NOT NULL REFERENCES itinerary_items (id),
    to_item_id uuid NOT NULL REFERENCES itinerary_items (id),
    transport_mode varchar(16) NOT NULL CHECK (transport_mode IN ('WALK', 'CAR', 'TRANSIT')),
    duration_seconds integer CHECK (duration_seconds >= 0),
    distance_meters integer CHECK (distance_meters >= 0),
    -- 지도 경로 LineString(좌표는 경도·위도 순). 경로 조회 실패나 미조회면 null
    geometry_json jsonb,
    status varchar(16) NOT NULL CHECK (status IN ('AVAILABLE', 'UNAVAILABLE')),
    queried_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_route_legs_distinct_items CHECK (from_item_id <> to_item_id),
    -- 실패·미조회는 0분·직선 거리로 채우지 않는다(PRD WD-FR-14)
    CONSTRAINT ck_route_legs_result CHECK (
        (status = 'AVAILABLE' AND duration_seconds IS NOT NULL AND distance_meters IS NOT NULL)
        OR (status = 'UNAVAILABLE' AND duration_seconds IS NULL AND distance_meters IS NULL AND geometry_json IS NULL)),
    CONSTRAINT uk_route_legs_pair UNIQUE (itinerary_id, from_item_id, to_item_id)
);

CREATE INDEX idx_route_legs_from_item_id ON route_legs (from_item_id);
CREATE INDEX idx_route_legs_to_item_id ON route_legs (to_item_id);
