-- 주변 편의시설(EODI-304, 명세 Q-8). 전기차 충전소는 한국환경공단 충전소 정보 API를 미리 넣고 상태만 주기적으로 고친다.
-- 화장실은 공중화장실 공공데이터 파일을 넣는다. 약국·편의점·주유소는 places(공공데이터 장소)에서 찾으므로 표가 없다

-- 충전소. id는 공급자 충전소 ID(statId, 운영사 기호로 시작해 전국에서 겹치지 않는다)
CREATE TABLE ev_stations (
    id varchar(20) PRIMARY KEY CHECK (btrim(id) <> ''),
    name varchar(200) NOT NULL CHECK (btrim(name) <> ''),
    address varchar(500),
    latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    operator_name varchar(100),
    use_time varchar(200),
    -- 마지막 전국 재수신에서 본 시각. 끝까지 받은 재수신에서 보이지 않은 충전소를 지운다
    seen_at timestamp with time zone NOT NULL
);

CREATE INDEX idx_ev_stations_location ON ev_stations
    USING gist ((ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography));

-- 충전기. 상태(status)는 공급자 코드 그대로 둔다(2 충전 대기, 3 충전 중, 4 운영 중지, 5 점검 중, 1·9 확인 못 함)
CREATE TABLE ev_chargers (
    station_id varchar(20) NOT NULL REFERENCES ev_stations (id),
    charger_id varchar(10) NOT NULL CHECK (btrim(charger_id) <> ''),
    charger_type varchar(4),
    output_kw integer CHECK (output_kw >= 0),
    status varchar(2),
    -- 공급자가 상태를 바꾼 시각. 이보다 오래된 상태 변경은 덮어쓰지 않는다
    status_updated_at timestamp with time zone,
    seen_at timestamp with time zone NOT NULL,
    PRIMARY KEY (station_id, charger_id)
);

-- 갱신 상태. 행 하나만 둔다. 서버가 여러 대여도 임대(lease)를 잡은 한 대만 갱신한다
CREATE TABLE ev_sync_state (
    id smallint PRIMARY KEY CHECK (id = 1),
    -- 마지막으로 끝까지 받은 전국 수신 시각. 없으면 아직 조회할 수 없다(503)
    full_completed_at timestamp with time zone,
    -- 마지막으로 상태를 맞춘 시각(전국 수신 또는 변경분 수신)
    status_synced_at timestamp with time zone,
    -- 갱신 빈틈을 메우지 못했으면 false. 다음 전국 수신까지 상태를 보여 주지 않는다
    status_valid boolean NOT NULL DEFAULT false,
    -- 한국 날짜별 전국 수신 시도 횟수(호출 한도 보호)
    full_attempt_day date,
    full_attempts integer NOT NULL DEFAULT 0 CHECK (full_attempts >= 0),
    lease_owner uuid,
    lease_until timestamp with time zone
);

INSERT INTO ev_sync_state (id) VALUES (1);

-- 공중화장실. 공급자 고유 번호가 없어 이름·좌표가 같으면 같은 화장실로 본다
CREATE TABLE public_toilets (
    id uuid PRIMARY KEY,
    name varchar(200) NOT NULL CHECK (btrim(name) <> ''),
    address varchar(500),
    latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    open_time varchar(200),
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT uq_public_toilets_name_location UNIQUE (name, latitude, longitude)
);

CREATE INDEX idx_public_toilets_location ON public_toilets
    USING gist ((ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography));
