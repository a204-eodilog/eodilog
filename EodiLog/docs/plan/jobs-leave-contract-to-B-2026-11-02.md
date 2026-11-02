# [BE] A → B jobs·기본 나가기 계약안 (2026-11-02)

상태: **B 전 항목 동의 / 사용자 구현 승인(2026-11-02), EODI-135 jobs 기반 구현**. 아래 네 항목과 담당 경계를 B가 모두 동의했으며 사용자가 Jira 생성 후 구현 진행을 승인했다. 기존에 사용자와 확정한 자료 유지·자동 방장 양도 정책은 유지한다. A의 최종 jobs Java SPI·설정은 [jobs 기반 문서](jobs-foundation.md)를 따른다. B의 나가기 구현 완료를 이 문서로 대신하지 않는다.

기준: [다음 분담안](backend-next-work-split-2026-11-02.md), [정책 답변 §5](to-B-backend-decisions-2026-11-02.md), [API 명세](../../../docs/api-spec.md) §4·§9·§10.

## 1. 먼저 맞출 결론

| 항목 | 제안 |
| --- | --- |
| jobs 공통 기반 담당 | A |
| 나가기 도메인·권한·방장 양도 담당 | B |
| 기본 나가기 응답 | 실제 변경을 끝낸 뒤 **200 + LeaveResult** |
| 기본 나가기 jobs 의존성 | 없음. 정리 대상이 없으므로 작업을 만들지 않음 |
| 삭제 옵션·마지막 멤버 이탈 | 실제 삭제 지원 전에는 명시적 409, 상태 변경 없음 |
| 향후 실제 비동기 정리 | 도메인 변경과 작업 등록을 같은 트랜잭션으로 커밋한 뒤 202 |

**B는 기본 나가기를 위해 jobs를 기다리지 않는다.** A도 jobs 기반과 여행 이탈을 한 MR로 묶지 않는다.

## 2. B 기본 나가기 API

`POST /api/v1/trips/{tripId}/leave`

기존 요청 필드 세 개를 유지하고 모두 필수로 받는다. 1단계에서는 두 삭제 옵션이 false일 때만 지원한다.

```json
{
  "expectedVersion": 3,
  "deleteOwnPhotos": false,
  "deleteOwnMessages": false
}
```

### 성공: 200 OK

```json
{
  "data": {
    "tripId": "019a0000-0000-7000-8000-000000000001",
    "tripDeleted": false,
    "newOwnerMemberId": null,
    "cleanupJobId": null,
    "status": "LEFT"
  }
}
```

- 응답 전에 이탈 처리가 실제 커밋돼야 한다. 동기 처리를 202 접수로 표현하지 않는다.
- 일반 멤버가 나가면 `newOwnerMemberId=null`. 방장이 나가 자동 양도되면 **새 방장의 멤버십 ID**를 반환한다(userId 아님).
- `cleanupJobId=null`. 비어 있는 정리 작업이나 가짜 SUCCEEDED 작업을 만들지 않는다.
- 경비·사진·메시지 원본은 유지한다. 멤버십 LEFT와 채팅 참여 종료를 같은 트랜잭션에서 처리한다.
- 여행 행을 잠근 뒤 ACTIVE 여부·expectedVersion·남은 멤버를 확인한다. 새 방장은 남은 ACTIVE 중 `joinOrder ASC, id ASC` 첫 사람이다.
- 방장 양도·이탈을 함께 처리해 **여행 version은 한 번만** 증가시킨다. 경비 version은 바꾸지 않는다.
- 나간 사용자는 이후 여행 내부 API에 접근할 수 없다. 응답을 만들려고 이탈 뒤 ACTIVE 상세 조회를 다시 호출하지 않는다.

### 실패와 검사 순서

Security의 인증·가입 완료 검사는 기존대로 적용한다. 인증을 통과한 요청의 도메인 판정은 아래 순서를 따른다.

| 순서 | 조건 | HTTP / error.code | 변경 여부 |
| --- | --- | --- | --- |
| 1 | 필수값 누락·null, 잘못된 UUID/타입, expectedVersion < 1 | 400 `VALIDATION_ERROR` | 없음 |
| 2 | 없는·삭제된·비참여·LEFT·REMOVED 여행 | 404 `TRIP_NOT_FOUND` | 없음 |
| 3 | 여행 version 불일치 | 409 `VERSION_CONFLICT` | 없음 |
| 4 | 삭제 옵션 중 하나라도 true | 409 `LEAVE_CLEANUP_UNAVAILABLE` **신규 제안** | 없음 |
| 5 | 남은 ACTIVE가 없어 마지막 한 명이 나가려 함 | 409 `TRIP_DELETE_UNAVAILABLE` **신규 제안** | 없음 |
| 6 | 그 외 | 200 `LeaveResult` | 이탈·필요 시 방장 양도 |

삭제 옵션이 true이면 현재 저장된 사진·메시지 유무와 무관하게 거부한다. 삭제 기능 지원 여부를 요청마다 다르게 가장하지 않는다. 두 미지원 조건이 겹치면 위 순서에 따라 삭제 옵션 오류를 먼저 반환한다.

실패 응답은 기존 `ErrorResponse` JSON을 사용한다. 삭제 옵션 거부에는 fields에 요청한 옵션 이름을 포함한다. 이탈 후 같은 요청을 다시 보내면 ACTIVE가 아니므로 404다. 현재 명세처럼 Idempotency-Key를 새 필수 헤더로 추가하지 않는다. 앱은 성공하면 여행 목록으로 이동하고, 통신 결과가 불명확하면 내 여행 목록을 다시 조회해 참여 상태를 확인한다.

## 3. A jobs 공통 기반 범위

| A 소유 | 도메인 기능 담당 소유 |
| --- | --- |
| JobRef·Job 공통 DTO, jobs 저장소·마이그레이션·상태 전이 | 작업 kind별 입력 검증과 도메인 권한 검사 |
| 내부 작업 등록 서비스, worker 선점·완료 기록·장애 복구 | 실제 AI 호출·파일 삭제 등 작업 실행기 |
| GET /jobs/{jobId}와 kind별 조회 정책 연결 | kind별 안전한 공개 result·오류 코드 정의 |
| 중복 실행 대비 실행 식별자·재시도 기반 | 외부 부수 효과·도메인 반영의 멱등 처리 |

여행 삭제·나가기 정리는 B 담당 기능으로 확장하되, 현재 미정인 물리 보존·삭제 범위를 A가 임의로 정하지 않는다. AI 기능 실행기 담당은 기능별 후속 분담에서 정한다.

### 내부 인터페이스 제안

아래는 Java 계약의 의미를 전달하기 위한 시그니처다. DTO 세부 타입은 A의 기반 MR에서 고정하고 B에게 공유한다.

```java
// 호출한 도메인 쓰기 트랜잭션에 반드시 참여한다(Propagation.MANDATORY).
JobRef submit(JobSubmission submission);

// kind별 실제 실행기를 등록한다. 네트워크·파일 I/O는 DB 잠금 밖에서 실행한다.
interface JobHandler {
    JobKind kind();
    JobExecutionResult execute(JobExecutionContext context);
}

// 도메인 소유 정책으로 매 조회마다 접근 권한을 판단한다.
interface JobAccessPolicy {
    JobKind kind();
    void requireReadable(UUID viewerUserId, JobReadContext context);
}
```

- `JobSubmission`: 서버가 정한 요청자 userId, nullable tripId, kind, 허용된 입력 스냅샷, 필요한 기준 version. 삭제 작업은 승인 시 고정한 대상 ID·cutoffAt도 포함한다.
- 요청 본문의 userId·권한 플래그를 그대로 신뢰하지 않는다. 입력/결과에는 토큰·원문 예외·불필요한 개인정보를 저장하지 않는다.
- `submit`은 DB에 QUEUED 작업만 저장한다. 같은 도메인 트랜잭션이 롤백되면 작업도 사라진다. worker는 커밋된 작업만 읽는다.
- **실행기·조회 정책이 없는 kind는 등록 불가**다. 개발자 구성 오류로 트랜잭션을 실패시키고 202를 반환하지 않는다. 작업이 없을 때 조회는 기존 404 규칙을 따른다.
- 처음에는 PostgreSQL 기반 worker로 구성하고 Redis·외부 큐 의존성을 새로 요구하지 않는다. 정확히 한 번 실행을 보장한다고 표현하지 않는다.
- worker가 실행 식별자·임대를 확인해 선점하고, 오래된 worker의 완료 기록을 거부한다. 재시도 때 같은 고정 대상과 외부 멱등 키를 사용한다.
- 실행기 결과는 kind별 제한된 result와 재시도 가능 여부·안전한 오류 코드로 전달한다. 공통 worker가 원문 예외 메시지를 응답에 넣지 않는다.

### 트랜잭션·재시도

1. 도메인 서비스에서 권한·입력 검증 → 도메인 변경 + submit → 같은 트랜잭션 커밋.
2. worker가 짧은 트랜잭션으로 작업 선점 → 외부 처리는 트랜잭션 밖에서 실행.
3. 결과 저장과 필요한 도메인 반영은 별도의 짧은 트랜잭션으로 수행. 일반 AI는 이 시점에도 권한·기준 version을 다시 검사한다.
4. 상태는 명세의 `QUEUED → RUNNING → SUCCEEDED/FAILED/CANCELLED`. 재시도 가능한 실패는 다음 실행 시각과 시도 횟수를 저장하고 QUEUED로 돌린다.
5. 초기 자동 재시도는 최초 포함 최대 3회 제안. 외부 타임아웃·일시 장애만 대상으로 하고 검증·권한·영구 실패는 재시도하지 않는다. 간격·timeout·임대/heartbeat 수치는 A 기반 MR에서 설정값과 테스트로 명시한다.
6. 서버 재시작 후 남은 QUEUED와 임대가 끝난 RUNNING을 복구한다. 취소·재선점된 실행의 늦은 결과가 완료 상태를 덮어쓰지 못하게 한다.

공통 기반 첫 단계에는 아직 실제 handler가 없는 운영 작업 kind를 활성화하지 않는다. 테스트용 실행기로 기반을 검증한 뒤, 실제 기능 MR에서 handler·조회 정책·공개 API를 함께 연결한다. 범용 `POST /jobs`·수동 재시도·취소 API는 이번에 추가하지 않는다.

## 4. jobs 공개 조회와 향후 정리 연결

- `JobRef`는 기존 `jobId,status:QUEUED,statusUrl`을 유지한다. `statusUrl`은 `/api/v1/jobs/{jobId}`다.
- `GET /jobs/{jobId}`는 기존 `DataResponse<Job>`를 유지한다. 없는 작업·타인에게 존재를 숨겨야 하는 작업은 404 `JOB_NOT_FOUND`로 통일한다.
- 개인 추출 작업은 요청자만, 여행 AI 작업은 현재 ACTIVE 멤버십·해당 자료 동의 정책으로 판단한다. 필요한 동의 기능이 없으면 작업을 활성화하지 않는다.
- 승인된 삭제 작업은 당시의 고정된 대상만 처리한다. 재가입 후 자료를 새로 검색해 추가하지 않는다.
- 정리 작업은 활성 계정인 최초 요청자가 이탈·여행 삭제 후에도 최소 상태를 조회할 수 있다. 다른 멤버에게 공개하지 않고 본문·파일·다른 사람 자료는 반환하지 않는다.

향후 실제 정리가 생기는 일반 이탈은 202 `LeaveResult`와 실제 `cleanupJobId`를 반환하는 방향이다. 기본 동기 이탈은 200을 유지한다. 마지막 멤버 이탈은 삭제 정책·실행기가 준비된 뒤 `tripDeleted=true,status:TRIP_DELETED`와 실제 TRIP_DELETE job으로 지원한다. 이번 1단계 구현에 이 동작을 미리 넣지 않는다.

## 5. 명세 반영·완료 기준

B가 이 안에 동의하면 B의 기본 나가기 MR에서 API 명세 §4·§10·오류표·Swagger를 함께 갱신한다. A jobs MR은 §9·Job/JobRef 및 jobs 물리 스키마·내부 인터페이스 문서를 담당한다. 서로 같은 명세 행을 동시에 수정하지 않도록 착수 때 범위를 공유한다.

| 담당 | 최소 검증 |
| --- | --- |
| B | 일반/방장 이탈, 양도 순서, version 한 번 증가, 채팅 동기화, 기존 경비 유지 |
| B | 삭제 옵션 true·마지막 멤버 거부 시 모든 상태 불변, 404/409 검사 순서, 두 명 동시 이탈 시 마지막 멤버 보호 |
| B | 성공 응답 200·cleanupJobId null·멤버십 ID 반환, 이탈 후 내부 접근 차단 |
| A | 도메인 rollback 시 작업 rollback, commit 전 실행 불가, 중복 선점·늦은 완료 차단 |
| A | 재시도 상한·재시작 복구, 미등록 kind 거부, kind별 조회 권한·result 비노출 |

각자 실제 Jira 이슈와 독립 MR로 나누고 전체 build를 통과시킨다. 이 문서 작성만으로 새 Jira 생성·구현·커밋·푸시는 수행하지 않는다.

## 6. B에게 확인받을 항목

1. A가 jobs 기반·worker·공개 조회를 맡고, B는 나가기 도메인과 향후 정리 실행기를 맡는 경계.
2. 기본 나가기는 jobs 없이 **200 + 기존 LeaveResult 필드**, cleanupJobId=null.
3. 미지원 삭제 옵션은 **409 LEAVE_CLEANUP_UNAVAILABLE**, 마지막 한 명은 **409 TRIP_DELETE_UNAVAILABLE**. 위 판정 순서 유지.
4. 실제 정리가 생길 때만 202·실제 작업 ID를 쓰고, 등록은 도메인 트랜잭션에 참여하는 인터페이스.

위 네 항목에 동의하면 기본 나가기와 jobs 기반은 독립적으로 착수할 수 있다. 정산·채팅의 이미 확정한 정책을 다시 바꿀 필요는 없다.
