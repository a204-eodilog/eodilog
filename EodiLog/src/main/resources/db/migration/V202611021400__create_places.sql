-- 장소. 공급자 장소는 (provider, provider_place_id)로 식별하고 이름·좌표만 같은 장소는 자동 병합하지 않는다(D-6)
-- 투표 후보·코스 항목·저장 장소가 이 행을 FK로 참조하므로 삭제 열을 두지 않는다
CREATE TABLE places (
    id uuid PRIMARY KEY,
    region_id uuid REFERENCES regions (id),
    name varchar(255) NOT NULL CHECK (btrim(name) <> ''),
    address varchar(500),
    latitude numeric(10, 7) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude numeric(10, 7) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    provider varchar(32) CHECK (btrim(provider) <> ''),
    provider_place_id varchar(255) CHECK (btrim(provider_place_id) <> ''),
    source varchar(16) NOT NULL CHECK (source IN ('PROVIDER', 'MANUAL')),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    -- 공급자 두 열은 함께 있거나 함께 없고, 공급자 장소만 값을 가진다
    CONSTRAINT ck_places_provider CHECK (
        (source = 'PROVIDER' AND provider IS NOT NULL AND provider_place_id IS NOT NULL)
        OR (source = 'MANUAL' AND provider IS NULL AND provider_place_id IS NULL)),
    CONSTRAINT uq_places_provider UNIQUE (provider, provider_place_id)
);

CREATE INDEX idx_places_region_id ON places (region_id);
