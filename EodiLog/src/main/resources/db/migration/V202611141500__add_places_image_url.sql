-- 장소 대표 사진(EODI-349). 한국관광공사 수집기가 firstimage(원본 URL)를 저장한다.
-- 공공누리 제1유형이라 앱이 사진 아래에 출처(한국관광공사)를 적는다. 네이버·소상공인 장소는 사진이 없어 null이다
ALTER TABLE places ADD COLUMN image_url varchar(1000) CHECK (btrim(image_url) <> '');
