-- 취향의 마지막 변경 시각(명세 Preferences.updatedAt). 프로필 수정(users.updated_at)과 분리한다
-- 직접 입력·추론 허용·공유 범위가 실제로 바뀌거나 추론 항목을 지우거나 추론 결과를 저장할 때만 바뀐다
ALTER TABLE user_preference_states ADD COLUMN updated_at timestamp with time zone;
UPDATE user_preference_states s SET updated_at = u.updated_at FROM users u WHERE u.id = s.user_id;
ALTER TABLE user_preference_states ALTER COLUMN updated_at SET NOT NULL;
