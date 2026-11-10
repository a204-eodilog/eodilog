-- 지역 상세 대표 장소(EODI-266). 지역(하위 포함)의 게시 스냅샷 장소를 장소별로 센다
CREATE INDEX idx_feed_places_region ON feed_places(region_id,place_id,feed_id);
