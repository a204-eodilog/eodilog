-- 주소 앞부분(시·도 + 시·군·구)으로 지역 코드를 찾는다(EODI-246).
-- 네이버 장소처럼 공급자가 지역 코드를 주지 않을 때 쓴다. 공공 장소 주소의 99.4%가 regions.name과 바로 맞는다.
-- 시·도 줄임말·옛 이름과 관할·이름이 바뀐 시·군·구는 아래 대응표로 바꾼다.
-- 시·도 이름만으로는 하위 지역이 없는 시·도(세종)만 맞춘다. 다른 시·도로 넓혀 맞추지 않는다. 못 찾으면 NULL이다.
CREATE FUNCTION region_code_for_address(address_text text) RETURNS varchar
    LANGUAGE sql
    STABLE
AS
$$
WITH tokens AS (
    SELECT regexp_split_to_array(regexp_replace(address_text, '^\s+|\s+$', '', 'g'), '\s+') AS t
), named AS (
    SELECT COALESCE(sido_alias.name, tokens.t[1]) AS sido, tokens.t[2] AS sigungu
    FROM tokens
    LEFT JOIN (VALUES ('서울', '서울특별시'), ('서울시', '서울특별시'),
                      ('부산', '부산광역시'), ('부산시', '부산광역시'),
                      ('대구', '대구광역시'), ('대구시', '대구광역시'),
                      ('인천', '인천광역시'), ('인천시', '인천광역시'),
                      ('대전', '대전광역시'), ('대전시', '대전광역시'),
                      ('울산', '울산광역시'), ('울산시', '울산광역시'),
                      ('세종', '세종특별자치시'), ('세종시', '세종특별자치시'),
                      ('광주', '전남광주통합특별시'), ('광주광역시', '전남광주통합특별시'),
                      ('전남', '전남광주통합특별시'), ('전라남도', '전남광주통합특별시'), ('전남광주', '전남광주통합특별시'),
                      ('경기', '경기도'),
                      ('강원', '강원특별자치도'), ('강원도', '강원특별자치도'),
                      ('충북', '충청북도'), ('충남', '충청남도'),
                      ('전북', '전북특별자치도'), ('전라북도', '전북특별자치도'),
                      ('경북', '경상북도'), ('경남', '경상남도'),
                      ('제주', '제주특별자치도'), ('제주도', '제주특별자치도'))
        AS sido_alias(short_name, name) ON sido_alias.short_name = tokens.t[1]
), candidate AS (
    SELECT named.sido, COALESCE(moved.name, named.sido || ' ' || named.sigungu) AS sigungu_name
    FROM named
    LEFT JOIN (VALUES ('경상북도 군위군', '대구광역시 군위군'),
                      ('인천광역시 남구', '인천광역시 미추홀구'))
        AS moved(old_name, name) ON moved.old_name = named.sido || ' ' || named.sigungu
)
SELECT r.code
FROM regions r, candidate c
WHERE r.name = c.sigungu_name
   OR (r.name = c.sido AND r.parent_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM regions child WHERE child.parent_id = r.id))
ORDER BY r.parent_id IS NULL
LIMIT 1
$$;
