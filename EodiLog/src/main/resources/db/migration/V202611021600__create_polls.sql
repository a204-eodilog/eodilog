-- 여행 안 지역·장소 투표(명세 §6, 정책 §13). 시각 마감만 있고 방장 수동 종료·전원 참여 조기 종료는 없다
-- 참여 대상은 지금 ACTIVE 멤버라 생성 시 참가자 스냅샷(poll_participants)은 두지 않는다(V-6a)
-- 마감할 때 집계를 eligible_member_count·voted_member_count·poll_candidates.vote_count에 고정한다(V-6d)
CREATE TABLE polls (
    id uuid PRIMARY KEY,
    trip_id uuid NOT NULL REFERENCES trips (id),
    created_by_member_id uuid NOT NULL REFERENCES trip_members (id),
    type varchar(16) NOT NULL CHECK (type IN ('REGION', 'PLACE')),
    title varchar(200) NOT NULL CHECK (btrim(title) <> ''),
    status varchar(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'FINALIZED')),
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    closes_at timestamp with time zone NOT NULL,
    closed_reason varchar(16) CHECK (closed_reason IN ('DEADLINE', 'NO_VOTES')),
    closed_at timestamp with time zone,
    finalized_at timestamp with time zone,
    eligible_member_count integer CHECK (eligible_member_count >= 0),
    voted_member_count integer CHECK (voted_member_count >= 0),
    created_at timestamp with time zone NOT NULL,
    -- 0표는 확정 없이 CLOSED/NO_VOTES, 표가 있으면 최다 후보를 확정한 FINALIZED/DEADLINE이다(V-13)
    CONSTRAINT ck_polls_state CHECK (
        (status = 'OPEN' AND closed_reason IS NULL AND closed_at IS NULL AND finalized_at IS NULL
            AND eligible_member_count IS NULL AND voted_member_count IS NULL)
        OR (status = 'CLOSED' AND closed_reason = 'NO_VOTES' AND closed_at IS NOT NULL AND finalized_at IS NULL
            AND eligible_member_count IS NOT NULL AND voted_member_count = 0)
        OR (status = 'FINALIZED' AND closed_reason = 'DEADLINE' AND closed_at IS NOT NULL AND finalized_at IS NOT NULL
            AND eligible_member_count IS NOT NULL AND voted_member_count > 0))
);

CREATE INDEX idx_polls_trip_created ON polls (trip_id, created_at, id);
-- 주기 마감이 마감 시각이 지난 OPEN 투표만 찾는다
CREATE INDEX idx_polls_open_closes_at ON polls (closes_at) WHERE status = 'OPEN';

-- 후보는 투표 유형과 같은 쪽 하나만 가진다(유형 일치는 서비스가 확인). 같은 투표에 같은 후보는 한 번만
CREATE TABLE poll_candidates (
    id uuid PRIMARY KEY,
    poll_id uuid NOT NULL REFERENCES polls (id),
    region_id uuid REFERENCES regions (id),
    place_id uuid REFERENCES places (id),
    -- 입력·추가한 순서. 후보는 지우지 않으므로 0부터 빈틈없이 늘어난다
    display_order integer NOT NULL CHECK (display_order >= 0),
    -- 마감 때 고정한 득표 수. OPEN 동안은 null이고 ACTIVE 멤버의 표로 그때그때 센다
    vote_count integer CHECK (vote_count >= 0),
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_poll_candidates_target CHECK ((region_id IS NULL) <> (place_id IS NULL)),
    CONSTRAINT uk_poll_candidates_region UNIQUE (poll_id, region_id),
    CONSTRAINT uk_poll_candidates_place UNIQUE (poll_id, place_id),
    CONSTRAINT uk_poll_candidates_display_order UNIQUE (poll_id, display_order)
);

CREATE INDEX idx_poll_candidates_region_id ON poll_candidates (region_id);
CREATE INDEX idx_poll_candidates_place_id ON poll_candidates (place_id);

-- 복수 선택. 나간 멤버의 표는 지우지 않고 집계에서만 뺀다(V-6b)
CREATE TABLE poll_votes (
    candidate_id uuid NOT NULL REFERENCES poll_candidates (id),
    member_id uuid NOT NULL REFERENCES trip_members (id),
    created_at timestamp with time zone NOT NULL,
    PRIMARY KEY (candidate_id, member_id)
);

CREATE INDEX idx_poll_votes_member_id ON poll_votes (member_id);

-- 최다 득표 후보마다 한 행(동률 포함). FINALIZED 투표에만 있다
CREATE TABLE poll_results (
    candidate_id uuid PRIMARY KEY REFERENCES poll_candidates (id),
    selected_at timestamp with time zone NOT NULL
);

-- 지역 투표로 추가된 여행지는 어느 후보에서 왔는지 남긴다(V-14)
ALTER TABLE trip_destinations
    ADD CONSTRAINT fk_trip_destinations_source_candidate
        FOREIGN KEY (source_candidate_id) REFERENCES poll_candidates (id);
