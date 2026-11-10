-- 지역 트렌드(EODI-262) 기간 후보 좁히기. 살아 있는 피드만 둔다.
-- 날짜 있는 피드: end_date >= 직전 기간 시작 범위를 훑고 start_date <= to는 인덱스 안에서 거른다
CREATE INDEX idx_feeds_live_trend_dated ON feeds(end_date,start_date) WHERE deleted_at IS NULL AND start_date IS NOT NULL;
-- 날짜 미정 피드: 게시 시각(Asia/Seoul 날짜 경계를 시각으로 바꾼 범위)
CREATE INDEX idx_feeds_live_trend_undated ON feeds(published_at) WHERE deleted_at IS NULL AND start_date IS NULL;
