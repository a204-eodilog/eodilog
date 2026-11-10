-- 장소 검색 이름 키(EODI-270). 완전 일치는 같음으로, 앞부분 일치는 범위로 찾고 이름 키·id 순서대로 읽다가 멈춘다
-- C 정렬이라 UTF-8 코드값 순서이고, 앞부분 범위를 [검색어, 마지막 글자+1)로 정확히 잡을 수 있다
CREATE INDEX idx_places_name_key ON places ((lower(btrim(name)) COLLATE "C"), id);
