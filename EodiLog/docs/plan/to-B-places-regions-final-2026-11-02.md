## [BE] A → B 장소·지역 답변 회신 (11/02)

[B 답변](to-A-places-regions-reply-2026-11-02.md) 잘 받았어요! **B가 제안한 세부 사항은 전부 받아들였어요.** [계약 문서](places-regions-contract-to-B-2026-11-02.md)를 합의 상태로 갱신했으니 최종 내용은 그쪽을 보면 돼요. B가 새로 정할 건 없어요.

### 1. 반영한 것

| B 제안 | 반영 위치 |
| --- | --- |
| 2번을 **2a(`places` 테이블·`PlaceReader`·테스트용 가짜 구현)**와 2b(카카오 연동·API)로 분리 | 계약 §6 |
| 일반구는 시로 묶기, 장소 `region_id`도 시 단위 | 계약 §3 |
| 세종 장소는 시·도 행에 바로 매핑 | 계약 §3 |
| `PlaceReader`·`RegionReader`는 엔티티가 아니라 명세 DTO 모양의 읽기 전용 record 반환 | 계약 §4 |
| `regionId` 검색 범위: 좌표가 있으면 좌표·반경, 없으면 지역 이름을 검색어 앞에 붙임 | 계약 §4 |
| 커서 안에 카카오 페이지 번호, 3페이지이거나 마지막이면 `hasNext=false` | 계약 §4 |
| 같은 카카오 장소를 다시 검색하면 이름·주소·좌표 갱신 | 계약 §4 |
| `RegionDetail`은 `introduction:null`, `representativePlaces:[]`, `partialErrors:[]` | 계약 §4 |
| 새 카카오 키는 `application-test.yaml`에도 가짜 값 | 계약 §5 |

### 2. 질문 답변 — 여행지 선택 단계

**시·도와 시·군·구 둘 다 허용**할게요. "제주도"처럼 시·도 단위로 고르는 경우가 흔해서요. B의 `destinationRegionIds` 검증은 지금처럼 존재 여부만 확인하면 돼요. 바꿀 것 없어요.

### 3. A 다음 일정

1. 지역 시드·`/regions`·`RegionReader`
2. **2a: `places` 테이블·`PlaceReader`·테스트용 가짜 `PlaceProvider`** ← 이게 머지되면 B가 투표·코스를 시작하면 돼요
3. 2b: 카카오 연동·`/places` API

`PlaceView`·`RegionView` record의 이름이나 좌표 타입이 구현 중에 바뀌면 머지 전에 먼저 알려 줄게요. 투표·코스 정책 정리해서 공유해 주면 같이 볼게요!
