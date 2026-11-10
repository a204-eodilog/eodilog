-- 장소 분류(EODI-247). 공공 수집기가 공급자 분류 이름을 '>'로 이어 저장한다(예: 음식>커피점/카페>카페, 문화시설)
-- 날씨 대안의 실내·실외 판단에 AI 입력으로만 쓴다(AI spec §1.1). 공개 Place 응답에는 싣지 않는다
ALTER TABLE places ADD COLUMN category varchar(200) CHECK (btrim(category) <> '');

-- 날씨 대안 후보를 대상 장소 반경으로 찾는다. 전국 수집 행을 전부 읽지 않도록 좌표 식 인덱스를 둔다
CREATE INDEX idx_places_location ON places
    USING gist ((ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography));
