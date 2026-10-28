-- 여행지·장소가 가리키는 지역. 코드 체계는 Q-8에서 정하므로 운영 자료는 넣지 않는다
CREATE TABLE regions (
    id uuid PRIMARY KEY,
    code varchar(100) NOT NULL UNIQUE,
    name varchar(200) NOT NULL,
    parent_id uuid REFERENCES regions (id),
    latitude numeric(10, 7) CHECK (latitude BETWEEN -90 AND 90),
    longitude numeric(10, 7) CHECK (longitude BETWEEN -180 AND 180)
);

CREATE INDEX idx_regions_parent_id ON regions (parent_id);
