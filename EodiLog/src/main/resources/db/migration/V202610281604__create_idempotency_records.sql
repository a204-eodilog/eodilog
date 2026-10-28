-- Idempotency-Key 요청 중복 방지(명세 §2). 생성 자원과 같은 트랜잭션에서 COMPLETED로 바꾼다
-- 인증 정보·소셜 토큰이 담긴 응답은 저장하지 않는다
CREATE TABLE idempotency_records (
    user_id uuid NOT NULL REFERENCES users (id),
    request_scope varchar(255) NOT NULL,
    idempotency_key varchar(100) NOT NULL,
    request_hash varchar(255) NOT NULL,
    status varchar(16) NOT NULL CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
    http_status integer,
    response_json jsonb,
    created_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    PRIMARY KEY (user_id, request_scope, idempotency_key),
    CONSTRAINT ck_idempotency_records_completed CHECK (status = 'IN_PROGRESS' OR http_status IS NOT NULL)
);

CREATE INDEX idx_idempotency_records_expires_at ON idempotency_records (expires_at);
