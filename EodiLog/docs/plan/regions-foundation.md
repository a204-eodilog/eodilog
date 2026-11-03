# 지역 기반 구현 — EODI-160

지역은 `region.dto.RegionView` record(UUID id, String code/name, UUID parentId, nullable BigDecimal latitude/longitude)로 공유한다. B의 기존 RegionRepository 사용과 문자열 테스트 코드는 유지한다.

- `region.service.RegionReader.find(UUID)`는 Optional, `findAll(Collection<UUID>)`은 ID별 Map을 반환한다. 없는 ID 생략, 중복 제거, 빈 입력 SQL 없음, 한 번의 IN 조회다.
- `region.service.RegionCodeResolver.resolve(String)`는 10자리 법정동 코드의 앞 5자리에 해당하는 시군구를 조회한다. 일반구39개는 `region_code_aliases`를 우선 조회해 상위 시로 연결한다. 직접 시군구229개와 세종3611000000은 공식 스냅샷 전용 `region_code_targets`230개로만 조회한다. 기존 regions에 남은 폐지지역·일반구 행은 활성 매핑으로 취급하지 않는다. 미매핑·폐지 시군구·형식 오류는 empty이며 시도로 추측하지 않는다. 후속 장소 provider는 이 인터페이스를 주입한다. 현재 스냅샷의 시군구 단위 매핑이며 개별 읍면동의 존폐 검증은 제공하지 않는다.
- 인증/가입 완료 후 `GET /api/v1/regions?query=...&cursor=...&limit=...`로 검색한다. query는 strip 후1~200자, limit 기본20/1~100. 이름의 문자 그대로 부분 일치(%/_도 문자)이며 정렬은 code ASC,id ASC다. created_at이 없는 지역은 공통 createdAt 정렬의 예외다. Base64URL 커서는 정규화 query와 code/UUID에 바인딩되며 다른 검색어/잘못된 커서는400 VALIDATION_ERROR다.
- 상세는 `GET /api/v1/regions/{regionId}`. DataResponse 안 RegionDetail(region,introduction=null,representativePlaces=[],partialErrors=[]). 미존재404 REGION_NOT_FOUND, 잘못된 UUID400. Swagger `/v3/api-docs` 테스트로 태그·DTO·인증을 검증한다.

## 공식 스냅샷과 재생성

출처: [행정표준코드관리시스템 법정동 다운로드](https://www.code.go.kr/etc/codeFullDown.do?codeseId=%EB%B2%95%EC%A0%95%EB%8F%99%EC%BD%94%EB%93%9C). 2026-11-02 다운로드. ZIP 멤버 수정시각2026-10-01T09:06:34+09:00는 법적 시행일이 아니다.

`docs/data/regions/legal-region-full.zip`에 원본 ZIP(CP949 TXT)을 보존한다. ZIP SHA256 `44a3fe4cacf88ce98e35fb883807d2725b589f427ff4d73ee40b914d1286bacd`, TXT SHA256 `962fd4cdfb6ccf2887b745eb97db55f71112b9f9a32c1f8fbd7692fb069b1df0`.

`seed-manifest.json`은 원본 메타데이터, 정규화 지역, 명시적 일반구 별칭과 고정 UUIDv7을 보존하는 SQL 생성 입력이다. 검증 스크립트는 ZIP을 CP949로 읽어 지역/계층/별칭을 다시 추출하고 manifest와 비교한다. 현재 존재 행만 남겨 시도(이름1토큰)+세종3611000000+직접2토큰 시군구를 선택한다. 코드 끝5자리가00000인3토큰 일반구는 같은 앞2토큰 도시로 연결한다. 이름은 trim한다. 시도15+세종1, 하위229=245개, 일반구39별칭이다. 최신 원본의12코드/29·46폐지 등을 그대로 보존하고17개 시도나3600000000을 합성하지 않는다. 폐지코드를 이름으로 새 코드에 연결하지 않는다.

오프라인 재생성/검증(프로젝트 EodiLog 디렉터리):

```powershell
powershell -NoProfile -File scripts/verify-region-snapshot.ps1
powershell -NoProfile -File scripts/generate-region-seed.ps1
powershell -NoProfile -File scripts/generate-region-seed.ps1 -Check
.\gradlew.bat build --console=plain
```

`V202611021500__seed_regions.sql`은 기존 code 충돌 시 ID/이름/좌표/참조를 유지하면서 parent_id는 공식 계층으로 보정한다. 자식과 별칭은 code 조회로 실제 기존 ID를 쓴다. 신규 대표좌표는 null이다. 기존 migrations 수정이나 운영DB 변경은 없다. 행정구역 개편 시 별도의 검증된 스냅샷/신규 migration이 필요하다.

일반 Gradle test/build의 RegionSeedArtifactTest는 PowerShell 없이 ZIP/TXT 해시, 원본 CP949에서 추출한 전체 지역명·부모·별칭, 고정 UUIDv7 manifest와 커밋 SQL의 일치를 검증한다. PowerShell -Check와 JUnit SQL 비교는 CRLF/LF 차이만 정규화한다.
