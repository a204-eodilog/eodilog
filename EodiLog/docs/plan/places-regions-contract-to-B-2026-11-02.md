# [BE] A → B 장소·지역 계약안 — 카카오 로컬 (2026-11-02)

상태: **B 전 항목 동의(2026-11-02) / A가 B 세부 제안 전부 수용**. B 답변은 [B → A 답변](to-A-places-regions-reply-2026-11-02.md), A의 최종 회신은 [A → B 회신](to-B-places-regions-final-2026-11-02.md)에 있다. 2a는 [EODI-159](https://jira.example.com/browse/EODI-159)로 진행한다(§7 끝의 구현 결과 참고). 나머지 작업은 아직 구현하지 않았다.

기준: [다음 분담안 A-2·B-4](backend-next-work-split-2026-11-02.md), [API 명세](../../../docs/api-spec.md) §5·DTO(Region·RegionDetail·Place·Bookmark·SavedPlace), [ERD](../../../docs/erd.dbml) `regions`·`places`·`trip_place_saves`, 기존 결정 D-6(공급자 ID 우선 식별).

## 1. 합의한 결론

| 항목 | 결론 |
| --- | --- |
| 장소·지역 API, 개인 즐겨찾기, 여행별 장소 저장 담당 | **A** |
| 투표·코스에서 지역·장소 ID 사용 담당 | **B** (A의 UUID·DTO·조회 인터페이스 재사용) |
| 장소 공급자 | **카카오 로컬 API** (키워드 검색, 좌표→행정구역 변환) |
| 지역 체계 | **법정동 코드 기반 2단계(시·도 → 시·군·구)**, 일반구는 시로 묶음. A가 시드 데이터로 채움 |
| 장소 동일성 | `provider=KAKAO` + 카카오 장소 ID. 이름·좌표만 같은 장소는 자동 병합하지 않음(D-6 유지) |
| 외부에 노출하는 ID | 항상 우리 `places.id`·`regions.id`(UUIDv7). 카카오 ID를 UUID 대신 쓰지 않음 |
| 공급자 장애 | `503 PROVIDER_UNAVAILABLE`. 검색 결과 없음은 `200 + 빈 목록`으로 구분 |
| 범위 | 국내 장소만. 해외는 이번 범위 밖 |

**B는 설계·서비스 코드를 §4 인터페이스만으로 먼저 쓸 수 있다.** 다만 투표 후보·코스 항목 테이블이 `places`를 FK로 참조하므로, B의 마이그레이션 머지와 장소 행을 쓰는 테스트는 A의 **2a(§6)** 머지 뒤에 가능하다.

## 2. 왜 카카오 로컬인가

- 국내 식당·카페·관광지 검색 품질이 가장 안정적이다. 현재 기획 문서에 해외 여행 요구는 없다.
- 이미 카카오 로그인을 쓰고 있어 같은 카카오 앱에서 REST API 키를 발급받아 쓸 수 있다.
- 무료 호출 한도가 프로젝트 규모에 충분하다. Google Places는 유료다. 정확한 한도는 착수 때 확인한다.
- 프론트가 카카오맵을 쓰면 좌표·장소 ID가 그대로 맞는다.

**한계:** 해외 장소는 거의 검색되지 않는다. 키워드 검색은 한 질의당 최대 45건(15건 × 3페이지)까지만 받을 수 있다. 공급자를 나중에 추가할 수 있도록 서버 내부는 `PlaceProvider` 인터페이스로 감싸고, 카카오 구현체 하나만 둔다.

## 3. 지역(regions)

B의 여행 스키마가 만든 `regions` 테이블을 그대로 쓴다. 현재는 운영 데이터가 비어 있으며, 아래 체계로 A가 시드한다.

| 항목 | 결론 |
| --- | --- |
| `code` | 법정동 코드 10자리. 예: 서울특별시 `1100000000`, 종로구 `1111000000` |
| 단계 | 시·도(`parent_id=null`) → 시·군·구. 읍·면·동은 넣지 않음 |
| 일반구가 있는 시 | 수원시·성남시처럼 구가 있는 시는 **시 행만** 둔다(예: 수원시 `4111000000`). 장안구 같은 일반구 행은 만들지 않음 |
| 세종특별자치시 | 하위 시·군·구가 없으므로 시·도 행만 둠 |
| 데이터 출처 | 행정안전부 법정동 코드 공개 자료. 신규 Flyway 마이그레이션으로 시드 |
| `latitude`·`longitude` | 대표 좌표(지도·검색 범위용). 확보하지 못한 지역은 null 허용 |
| 행정구역 개편 | 새 코드를 추가하고 기존 행은 삭제하지 않음. 이미 참조된 ID를 바꾸지 않음 |
| 여행지로 고를 수 있는 단계 | **시·도와 시·군·구 모두 허용**. B의 `destinationRegionIds` 검증은 지금처럼 존재 여부만 확인 |

장소의 `region_id` 매핑 규칙:

1. 카카오 좌표→행정구역 변환에서 법정동 코드를 받는다.
2. 일반구 코드면 소속 시 코드로 바꾼다. 일반구는 코드 앞자리를 자르는 것만으로 시가 되지 않으므로 A가 매핑 표를 둔다.
3. 세종 장소는 세종 시·도 행에 매핑한다.
4. 그 밖에는 시·군·구 행에 매핑한다. 어느 행에도 매핑되지 않으면 null로 둔다.

B 테스트는 지금처럼 `TEST-<uuid>`·`JEJU` 같은 문자열 코드를 쓰므로 숫자 법정동 시드와 겹치지 않는다.

## 4. 장소(places)와 B가 쓰는 계약

### DTO — 기존 명세 그대로 유지

| DTO | 필드 |
| --- | --- |
| Region | `id,code,name,parentId:id\|null,latitude:number\|null,longitude:number\|null` |
| Place | `id,name,address:string\|null,latitude,longitude,regionId:id\|null,provider:string\|null,providerPlaceId:string\|null,source:PROVIDER\|MANUAL` |
| RegionDetail | `region:Region,introduction:null,representativePlaces:[],partialErrors:[]` — 소개·대표 장소는 이번 범위 밖이므로 이 값으로 고정 |

`provider`는 `KAKAO` 또는 null(수동 장소)이다. 카테고리·전화번호·카카오 상세 링크는 이번에 DTO에 넣지 않는다.

### 검색·저장 흐름

1. `GET /places?query=...&regionId=...`가 들어오면 카카오 키워드 검색을 호출한다.
2. `regionId`가 있으면 범위를 좁힌다. 지역 대표 좌표가 있으면 좌표·반경으로, 없으면 지역 이름을 검색어 앞에 붙인다.
3. 각 결과를 `(provider, provider_place_id)` 기준으로 `places`에 upsert한다. 이미 있는 장소면 이름·주소·좌표·지역을 갱신하고 `updated_at`을 바꾼다. 이번 결과의 지역을 알 수 없으면 기존 지역을 유지한다. 동시 저장으로 unique 충돌이 나면 기존 행을 다시 조회한다.
4. 응답은 우리 UUID를 담은 `Place[]`만 돌려준다.
5. 페이지는 공통 커서 형식을 쓴다. 커서 안에 카카오 페이지 번호를 담고, 3페이지이거나 카카오가 마지막이라고 하면 `hasNext=false`다.
6. `POST /places`는 수동 장소(`source=MANUAL`, provider null)를 만든다. 공급자 장소를 수동 장소로 복제하지 않는다.

### B가 쓰는 내부 조회 인터페이스

B의 투표·코스 코드는 `places`·`regions` 테이블을 직접 조회하지 않고, A가 제공하는 읽기 전용 인터페이스를 쓴다. 반환값은 **JPA 엔티티가 아니라 명세 DTO 모양의 읽기 전용 record**다. B는 이 값을 `ItineraryItem.place` 같은 응답에 그대로 실을 수 있다.

```java
public record PlaceView(UUID id, String name, String address, BigDecimal latitude, BigDecimal longitude,
                        UUID regionId, String provider, String providerPlaceId, PlaceSource source) { }
public record RegionView(UUID id, String code, String name, UUID parentId,
                         BigDecimal latitude, BigDecimal longitude) { }

public interface PlaceReader {
    Optional<PlaceView> find(UUID placeId);
    Map<UUID, PlaceView> findAll(Collection<UUID> placeIds); // 없는 ID는 결과에서 빠짐
}
public interface RegionReader {
    Optional<RegionView> find(UUID regionId);
    Map<UUID, RegionView> findAll(Collection<UUID> regionIds);
}
```

- record 이름·좌표 타입은 구현 때 기존 코드 관례에 맞춰 확정하고, 바뀌면 B에게 먼저 알린다. 필드 구성은 위 명세 DTO와 같다.
- 없는 ID를 어떻게 거부할지(404/422)는 호출하는 B 기능의 API 계약에 따라 B가 판단한다.
- 지금 B가 `RegionRepository`를 직접 쓰는 여행 코드는 그대로 둔다. 새 코드부터 인터페이스를 쓰고, 기존 코드 전환은 강제하지 않는다.

## 5. 카카오 자료 저장 범위와 설정

- 우리 DB에는 **장소 ID·이름·주소·좌표·지역**만 저장한다. 리뷰·사진·영업시간 같은 상세는 저장하지 않는다.
- 카카오 약관상 검색 결과를 얼마나 오래 저장할 수 있는지(Q-12)는 **A가 2b 착수 전에 약관을 확인**하고 이 문서에 결과를 추가한다. 장기 저장이 불가하면 §4의 재검색 갱신 외에 주기적 갱신을 더한다. 우리 UUID와 카카오 ID 매핑은 유지하므로 B 계약은 바뀌지 않는다.
- 카카오 REST API 키는 `.env`에 새 환경변수로 넣는다. 로그인용 키와 같은 카카오 앱을 쓰되 이름은 분리한다. 실제 키 값은 문서·커밋에 넣지 않는다.
- 새 환경변수는 `application-test.yaml`에도 가짜 값을 넣어, 키가 없어서 테스트 컨텍스트가 뜨지 않는 일이 없게 한다.

## 6. A 작업 분할 (Jira 예정)

아래 순서로 Jira·브랜치·MR을 하나씩 나눈다.

| 순서 | 작업 | B 영향 |
| --- | --- | --- |
| 1 | 지역 시드·일반구 매핑 표·`GET /regions`·`GET /regions/{regionId}`·`RegionReader` | B 여행 생성이 실제 지역을 쓸 수 있게 됨 |
| **2a** | `places` 마이그레이션·`PlaceReader`·테스트용 가짜 `PlaceProvider` | **B 투표·코스 마이그레이션·테스트 머지 가능 시점** |
| 2b | 카카오 연동·`GET /places`·`GET /places/{placeId}`·`POST /places` | 실제 장소 검색이 가능해짐 |
| 3 | 개인 즐겨찾기 `/me/bookmarks` | 없음 |
| 4 | 여행별 장소 저장 `/trips/{tripId}/saved-places` | B의 ACTIVE 멤버 권한 규칙 재사용 |

`RegionDetail`의 실제 소개·대표 장소, 장소 소셜 요약·공개 평가·주변 시설은 이번 범위가 아니다.

## 7. 테스트

- 2a에서 `PlaceProvider`의 테스트용 가짜 구현을 함께 넣는다. B의 투표·코스 테스트는 실제 카카오를 부르지 않고 장소를 만들 수 있다.
- B는 테스트에서 `places`에 행을 직접 넣을 수도 있다. 이때 `provider`·`provider_place_id`는 "둘 다 null 또는 둘 다 값" 제약을 지킨다.

2a 구현 결과(EODI-159):

| 쓰는 것 | 위치·사용법 |
| --- | --- |
| 조회 | `place.service.PlaceReader`(`find`·`findAll`) → `place.dto.PlaceView` record. 필드는 §4 그대로이며 좌표 타입은 `BigDecimal`, `source`는 `place.domain.PlaceSource` |
| 테스트에서 장소 만들기 | `@Autowired PlaceResolver` 후 `resolver.resolve(FakePlaceProvider.NAME, new ProviderPlace("ext-1", "성산일출봉", null, new BigDecimal("33.458"), new BigDecimal("126.942"), null))`가 저장된 `PlaceView`를 돌려준다. 같은 공급자 ID로 다시 부르면 같은 장소를 갱신한다 |
| 가짜 공급자 | 테스트 패키지 `place.FakePlaceProvider`. 검색·페이지·장애를 흉내 낸다 |
| SQL로 직접 넣기 | `INSERT INTO places(id,name,latitude,longitude,source,created_at,updated_at) VALUES (?, '장소', 33, 126, 'MANUAL', now(), now())`. `PROVIDER`면 `provider`·`provider_place_id`를 함께 넣는다 |
| 마이그레이션 | `V202611021400__create_places.sql`. B의 투표·코스 마이그레이션은 이보다 늦은 번호를 쓴다 |

## 8. 합의 결과

| 항목 | 결과 |
| --- | --- |
| 1. 장소·지역·즐겨찾기·여행별 저장은 A, 투표·코스는 A의 ID·DTO·Reader 재사용 | B 동의 |
| 2. 법정동 코드 기반 시·도/시·군·구 2단계, A 시드, `regions` 구조 유지 | B 동의. 일반구는 시로 묶고 세종은 시·도 행에 매핑(B 제안 수용) |
| 3. 카카오 로컬, 외부엔 우리 UUID만, Place·Region DTO 명세 유지 | B 동의 |
| 4. 투표 후보·코스 항목은 `places` 행이 있는 장소만 허용 | B 동의 |
| 5. 테스트 지역 코드는 시드와 겹치지 않게 | B 동의 |
| B 세부 제안(2a 분리, Reader record 반환, 검색 범위·커서·갱신, RegionDetail 고정값, 테스트용 가짜 구현·설정) | A 전부 수용 |
| 여행지 선택 단계 | 시·도와 시·군·구 모두 허용 |
