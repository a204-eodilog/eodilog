-- 연령대는 영문 코드만 저장한다(명세 §3 PATCH /me). 지금까지 저장 API가 없어 기존 값은 모두 NULL이다
ALTER TABLE users ADD CONSTRAINT ck_users_age_band
    CHECK (age_band IS NULL OR age_band IN ('TEENS', 'TWENTIES', 'THIRTIES', 'FORTIES', 'FIFTIES', 'SIXTIES_PLUS'));

-- 닉네임 부분 일치 검색(GET /users). 검색 대상(활동 중·가입 완료)만 색인한다. pg_trgm은 V202611041800에서 만들었다
CREATE INDEX idx_users_nickname_search ON users USING gin (lower(nickname) gin_trgm_ops)
    WHERE status = 'ACTIVE' AND profile_completed;
