-- 정산 계산 결과. 계산할 때의 경비를 스냅샷으로 남겨 이후 경비가 바뀌어도 과거 계산을 덮어쓰지 않는다(Q-10, 2026-11-02 확정)
-- 여행이 있는 동안 모두 보관한다. 완료 상태·송금 확인은 두지 않는다
CREATE TABLE settlements (
    id uuid PRIMARY KEY,
    trip_id uuid NOT NULL REFERENCES trips (id),
    calculated_by_member_id uuid NOT NULL REFERENCES trip_members (id),
    expense_version bigint NOT NULL CHECK (expense_version >= 0),
    currency varchar(3) NOT NULL DEFAULT 'KRW' CHECK (currency = 'KRW'),
    total_amount_minor bigint NOT NULL CHECK (total_amount_minor >= 0),
    rounding_policy varchar(64) NOT NULL,
    rounding_adjustment_minor bigint NOT NULL CHECK (rounding_adjustment_minor >= 0),
    expense_snapshot_json jsonb NOT NULL,
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    calculated_at timestamp with time zone NOT NULL
);

CREATE INDEX idx_settlements_trip_calculated ON settlements (trip_id, calculated_at, id);

-- 멤버별 결제·원금 부담·올림 부담·잔액. 잔액 합은 0이다(서비스가 보장)
CREATE TABLE settlement_members (
    settlement_id uuid NOT NULL REFERENCES settlements (id),
    member_id uuid NOT NULL REFERENCES trip_members (id),
    paid_minor bigint NOT NULL CHECK (paid_minor >= 0),
    base_owed_minor bigint NOT NULL CHECK (base_owed_minor >= 0),
    owed_minor bigint NOT NULL CHECK (owed_minor >= base_owed_minor AND owed_minor % 10 = 0),
    rounding_adjustment_minor bigint NOT NULL CHECK (rounding_adjustment_minor >= 0),
    balance_minor bigint NOT NULL,
    -- 계산할 때의 참여 순. 재참여로 참여 순이 바뀌어도 과거 계산의 표시 순서는 그대로다
    display_order integer NOT NULL CHECK (display_order >= 1),
    PRIMARY KEY (settlement_id, member_id),
    CONSTRAINT uk_settlement_members_order UNIQUE (settlement_id, display_order)
);

CREATE INDEX idx_settlement_members_member_id ON settlement_members (member_id);

-- 송금 제안. 이 금액을 다시 10원 단위로 올리지 않는다
CREATE TABLE settlement_transfers (
    id uuid PRIMARY KEY,
    settlement_id uuid NOT NULL REFERENCES settlements (id),
    from_member_id uuid NOT NULL REFERENCES trip_members (id),
    to_member_id uuid NOT NULL REFERENCES trip_members (id),
    amount_minor bigint NOT NULL CHECK (amount_minor > 0),
    -- 계산할 때 정한 표시 순서(금액이 큰 순)
    display_order integer NOT NULL CHECK (display_order >= 1),
    CONSTRAINT ck_settlement_transfers_members CHECK (from_member_id <> to_member_id),
    CONSTRAINT uk_settlement_transfers_order UNIQUE (settlement_id, display_order)
);

CREATE INDEX idx_settlement_transfers_settlement_id ON settlement_transfers (settlement_id);
CREATE INDEX idx_settlement_transfers_from_member_id ON settlement_transfers (from_member_id);
CREATE INDEX idx_settlement_transfers_to_member_id ON settlement_transfers (to_member_id);

-- 현재 계산 포인터. 컬럼은 여행 테이블을 만들 때 넣어 두었고 참조 대상이 생겨 FK를 건다
ALTER TABLE trips
    ADD CONSTRAINT fk_trips_current_settlement FOREIGN KEY (current_settlement_id) REFERENCES settlements (id);
