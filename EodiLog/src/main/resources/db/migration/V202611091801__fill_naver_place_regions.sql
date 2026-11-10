-- 장소 추출로 지역 없이 저장된 네이버 장소의 지역을 주소로 한 번 채운다(EODI-246).
-- 이후 추출은 저장할 때 같은 함수로 채운다. 못 찾은 장소는 NULL로 남는다.
UPDATE places p
SET region_id = r.id
FROM regions r
WHERE p.provider = 'NAVER'
  AND p.region_id IS NULL
  AND r.code = region_code_for_address(p.address);
