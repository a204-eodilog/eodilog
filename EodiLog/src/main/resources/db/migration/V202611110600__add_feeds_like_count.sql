-- 둘러보기 추천(EODI-265). 피드 좋아요 수를 feeds에 함께 두어 (좋아요 수 DESC, 게시 시각 DESC, ID DESC) 키셋을 인덱스로 걷는다.
-- 값은 좋아요·취소와 같은 트랜잭션에서 feed_likes에 실제로 행이 들어가거나 지워졌을 때만 바꾼다. 다른 마이그레이션처럼 CONCURRENTLY는 쓰지 않는다
ALTER TABLE feeds ADD COLUMN like_count integer NOT NULL DEFAULT 0 CHECK (like_count >= 0);
UPDATE feeds f SET like_count=c.n FROM (SELECT feed_id,count(*) AS n FROM feed_likes GROUP BY feed_id) c WHERE c.feed_id=f.id;
CREATE INDEX idx_feeds_discovery ON feeds(like_count DESC,published_at DESC,id DESC) WHERE deleted_at IS NULL;
