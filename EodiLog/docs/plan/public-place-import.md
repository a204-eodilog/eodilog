# 전국 공공 장소 수집·조회

Jira: EODI-193

## 데이터 범위

- 소상공인시장진흥공단 상가(상권)정보 **전국 CSV/ZIP**: 모든 업종을 가져온다. `SBDC` 공급자 ID를 키로 재수집한다.
- 한국관광공사 국문 관광정보 `KorService2/areaBasedList2`: 지역·관광 유형 필터 없이 전체 페이지를 가져온다. `KTO` 콘텐츠 ID를 키로 재수집한다. 좌표가 없는 행은 핀으로 표시할 수 없어 건너뛴다.
- 원본 사진은 수집하지 않는다. 기존 `places` 테이블에 이름, 주소, 좌표, 지역, 공급자 ID를 저장한다.

공식 자료:

- [상가 전국 파일 다운로드](https://www.data.go.kr/data/15083033/fileData.do) — 이 수집기의 상가 입력이다. API 키가 필요하지 않다.
- [상가 OpenAPI 활용 신청](https://www.data.go.kr/data/15012005/openapi.do) — API 키로 조회할 수도 있으나 현재 수집기는 이 API를 호출하지 않는다.
- [한국관광공사 국문 관광정보 OpenAPI 활용 신청](https://www.data.go.kr/data/15101578/openapi.do) — 이 수집기가 쓰는 `serviceKey`를 발급받는다.

## 1회 수집 실행

정상 서버 시작 시에는 수집하지 않는다. 전국 상가 CSV/ZIP 또는 이를 풀어놓은 폴더와 관광정보 API 서비스 키를 준비한 뒤 아래처럼 별도 프로세스로 실행한다. 하나만 지정해도 된다.

```powershell
$env:APP_PLACE_IMPORT_ENABLED = 'true'
$env:APP_PLACE_IMPORT_SBDC_PATH = 'C:\data\sbdc-nationwide.zip'
$env:APP_PLACE_IMPORT_SBDC_CHARSET = 'UTF-8'
$env:APP_PLACE_IMPORT_KTO_KEY = '<data.go.kr service key>'
./gradlew.bat bootRun --args='--server.port=0 --app.jobs.enabled=false --app.polls.auto-close-enabled=false'
```

수집 결과 수가 로그에 출력되면 실행한 `bootRun`을 종료한다. CSV가 CP949이면 `APP_PLACE_IMPORT_SBDC_CHARSET=MS949`로 설정한다. 중단된 관광 수집은 `APP_PLACE_IMPORT_KTO_START_PAGE`를 마지막 성공 페이지 다음 번호로 지정해 재실행할 수 있다. 이미 저장된 페이지를 다시 가져와도 공급자 ID 기준으로 갱신된다.

## 공중화장실 넣기(EODI-304)

주변 편의시설(S28)의 화장실은 `public_toilets`에서 찾는다. 공공데이터포털 공중화장실 정보는 2025년 2월부터 원본 좌표 제공이 중단되어, 받은 CSV(EUC-KR, 약 5.4만 행)의 주소를 좌표로 바꿔 `위도`·`경도` 열을 붙인 파일을 넣는다. 2026-11-11 카카오 로컬 주소 검색으로 바꾼 파일을 팀에 공유한다(도로명주소로 먼저, 없으면 지번주소로 찾았다). 옛 표준데이터의 `WGS84위도`·`WGS84경도` 열도 읽는다. 미개방 화장실과 좌표가 없는 행은 건너뛰고, 이름·좌표가 같으면 같은 화장실로 보고 다시 넣어도 늘지 않는다.

```powershell
$env:APP_PLACE_IMPORT_ENABLED = 'true'
$env:APP_PLACE_IMPORT_TOILET_PATH = 'C:\Users\<me>\Downloads\공중화장실정보_좌표.csv'
./gradlew.bat bootRun --args='--spring.profiles.active=local --server.port=0 --app.jobs.enabled=false --app.polls.auto-close-enabled=false --app.facilities.ev.sync-enabled=false'
```

`Toilet import processed N valid rows`가 로그에 나오면 종료한다. 파일이 UTF-8이면 `APP_PLACE_IMPORT_TOILET_CHARSET=UTF-8`(기본 MS949). 넣기 전에는 화장실 조회가 503 `FACILITY_UNAVAILABLE`이다. 충전소는 서버가 키(`EV_SERVICE_KEY`, 비면 `KMA_SERVICE_KEY`)로 직접 받으므로 따로 넣지 않는다.

## 앱 API

- `GET /api/v1/places?query=카페&regionId={uuid}&limit=20&cursor={uuid}`: 로컬 전국 카탈로그 검색. `regionId`와 `cursor`는 선택값이다. 응답은 `data`와 `page.nextCursor`를 포함한다.
- `GET /api/v1/places/{placeId}`: 장소 상세. 위도·경도를 포함한다.
- `POST /api/v1/places`: 공공 데이터에 없는 장소를 수동 등록. 요청 본문은 `name`, `address`, `latitude`, `longitude`, `regionId`(선택)다.

프론트의 네이버 지도는 조회 응답의 위도·경도로 핀을 그린다. 즐겨찾기 저장·지역별 지도 클러스터링은 이 수집 API와 별도 기능이다.
