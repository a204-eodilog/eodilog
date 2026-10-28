---
title: "ADR-0001 DB 엔진 선택"
status: accepted
created: 2026-10-28
jira: EODI-50
parent: EODI-48
---

# ADR-0001 DB 엔진 선택

## 결정

**PostgreSQL + PostGIS**를 주 DB로 쓴다. **Redis는 필요할 때만** 붙인다(아래 조건). 사진·캡처 파일은 DB가 아니라 객체 저장소(`assets.object_key`)에 둔다.

| 구성 | 쓰는 곳 | 시점 |
| --- | --- | --- |
| PostgreSQL | 모든 서비스 데이터, `jobs` 작업 큐, 멱등 기록 | 처음부터 |
| PostGIS 확장 | 지도 범위 마커, 주변 장소 거리 검색 | 처음부터(확장 설치) |
| Redis | 실시간 공동 편집의 접속 표시·여러 서버 간 메시지 전달 | Q-15 실시간 방식 확정 후, 필요할 때 |
| pgvector 확장 | 임베딩 기반 추천 | 추천 품질 비교를 시작할 때([AI plan](../../../ai/docs/plan.md) §1.1) |

## 배경

- [ERD](../../erd.dbml)와 [API 명세](../../api-spec.md) D-1이 "DB 엔진 미선정"으로 남아 있었다. 백엔드(`EodiLog`)에도 아직 DB 의존성이 없다.
- 후보: PostgreSQL, MySQL. 문서형 DB(MongoDB)와 Redis 단독 저장도 검토했다.

## 이유

| ERD·PRD 요구 | PostgreSQL에서 |
| --- | --- |
| 관계가 강한 모델(여행·멤버·투표·코스·경비·피드)과 ERD 불변식(복합 FK, 행 잠금, version 비교 갱신, 한 트랜잭션 안의 원자 변경) | 트랜잭션·FK·`SELECT … FOR UPDATE`로 그대로 옮긴다 |
| JSON 열(`input_json`, `result_json`, `geometry_json`, `before_content_json`, `payload_json` 등) | `jsonb` + 필요하면 GIN 인덱스. AI 응답을 변환 없이 `result_json`에 저장 |
| 위치 검색(홈 지도 범위 마커, 주변 1km, 방문 판정 300m) | PostGIS `geography` + GiST 인덱스, `ST_DWithin`. 위도·경도 두 열 범위 조건보다 인덱스를 잘 탄다 |
| 백엔드 작업 큐(`jobs.status = QUEUED`) | `FOR UPDATE SKIP LOCKED`로 별도 메시지 큐 없이 worker 구현 |
| UUID 문자열 ID | 네이티브 `uuid` 타입. 인덱스 지역성을 위해 UUIDv7 권장 |
| 나중의 임베딩 추천 | DB를 바꾸지 않고 pgvector 확장만 추가 |

Spring Boot + Hibernate에서 `jsonb`는 `@JdbcTypeCode(SqlTypes.JSON)`, 공간 타입은 hibernate-spatial로 매핑한다.

## 쓰지 않은 선택지

| 선택지 | 쓰지 않는 이유 |
| --- | --- |
| MySQL 8 | JSON·공간 인덱스·`SKIP LOCKED`는 있어 기능 요구는 맞출 수 있다. 다만 벡터 검색 확장 경로가 없고, UUID를 `BINARY(16)` 변환으로 다뤄야 하며, 공간 기능이 PostGIS보다 덜 성숙하다 |
| MongoDB | 투표 확정·경비 정산·코스 version 검사처럼 여러 행에 걸친 트랜잭션과 관계 무결성이 핵심이라 맞지 않는다 |
| 채팅 전용 DB | 여행 그룹 채팅만 있고 1:1이 없어 규모가 작다. `messages (room_id, sequence)` 고유 인덱스로 충분하다 |
| Kafka 등 메시지 큐 | 사용자 규모에 비해 과하다. 작업 큐는 `jobs` 테이블로 처리한다 |

## Redis를 붙이는 조건

다음 중 하나가 생기면 붙인다. 그 전에는 PostgreSQL만 쓴다.

1. 그룹 즐겨찾기·코스 실시간 공동 편집(Q-15)에서 접속·편집 중 멤버 표시(TTL)가 필요할 때
2. 백엔드 서버가 2대 이상이 되어 WebSocket 메시지를 서버끼리 전달(pub/sub)해야 할 때. 서버 1대면 PostgreSQL `LISTEN/NOTIFY`로 시작할 수 있다
3. `idempotency_records`·조회 캐시의 만료 처리가 DB 부하가 될 때

## 영향

- ERD의 논리 타입을 물리 타입으로 옮길 때: `uuid` → `uuid`, `json` → `jsonb`, `timestamp` → `timestamptz`(UTC). `places`·`regions` 위치는 PostGIS 열 추가 여부를 물리 설계에서 정한다.
- 백엔드 DB 연결과 로컬 실행 환경(Docker 이미지·버전 고정)은 EODI-62에서 진행한다.

## 다시 검토할 조건

- 팀 대부분이 PostgreSQL 운영에 막혀 일정이 밀릴 때(→ MySQL 8로 전환. 아직 DDL이 없어 비용이 작은 시점에 판단)
- 배포 환경에서 PostGIS 확장을 쓸 수 없을 때
