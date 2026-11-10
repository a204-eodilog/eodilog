-- 피드 좋아요(명세 §5 PUT/DELETE /feeds/{feedId}/like). 사용자·피드당 하나이며 재게시한 피드(새 ID)는 0부터 센다
CREATE TABLE feed_likes (
 feed_id uuid NOT NULL REFERENCES feeds(id),
 user_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL,
 PRIMARY KEY(feed_id,user_id)
);
CREATE INDEX idx_feed_likes_user ON feed_likes(user_id);
