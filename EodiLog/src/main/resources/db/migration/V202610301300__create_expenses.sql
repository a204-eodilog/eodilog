-- 여행 경비. 등록자만 수정·삭제하고 방장·결제자라도 대신하지 않는다(명세 §7)
-- 결제자·등록자·분담자가 같은 여행 멤버십인지는 서비스가 보장한다. 이탈해도 경비는 남는다
-- 삭제는 deleted_at으로 남겨 이전 정산 스냅샷과 비용 버전 이력을 깨지 않는다
CREATE TABLE expenses (
    id uuid PRIMARY KEY,
    trip_id uuid NOT NULL REFERENCES trips (id),
    registered_by_member_id uuid NOT NULL REFERENCES trip_members (id),
    payer_member_id uuid NOT NULL REFERENCES trip_members (id),
    title varchar(200) NOT NULL CHECK (btrim(title) <> ''),
    memo text,
    -- 양수 원화 정수. 프론트 정밀도 손실을 막도록 JSON 안전 정수 이하(명세 §2)
    amount_minor bigint NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 9007199254740991),
    currency varchar(3) NOT NULL DEFAULT 'KRW' CHECK (currency = 'KRW'),
    spent_at timestamp with time zone NOT NULL,
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);

CREATE INDEX idx_expenses_trip_spent_at ON expenses (trip_id, spent_at);
CREATE INDEX idx_expenses_trip_created ON expenses (trip_id, created_at, id) WHERE deleted_at IS NULL;

-- 분담자별 원금 분담액. 합계는 경비 원금과 같다(서비스가 보장). 정산 10원 올림은 여기 넣지 않는다(Q-10)
CREATE TABLE expense_shares (
    expense_id uuid NOT NULL REFERENCES expenses (id),
    member_id uuid NOT NULL REFERENCES trip_members (id),
    amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
    PRIMARY KEY (expense_id, member_id)
);

CREATE INDEX idx_expense_shares_member_id ON expense_shares (member_id);
