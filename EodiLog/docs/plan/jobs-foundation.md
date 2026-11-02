# PostgreSQL jobs 기반 (EODI-135)

`job` 패키지는 내부 등록과 `GET /api/v1/jobs/{jobId}`를 제공한다. 실제 AI·파일 삭제·나가기 실행기는 이 변경에 없다. 빈 registry도 정상 시작하며 공개 POST/retry/cancel 경로와 가짜 작업을 만들지 않는다. B 도메인 연결은 별도 기능 MR에서 한다.

## 등록 및 SPI

`JobService.submit(JobSubmission)`은 `Propagation.MANDATORY`이며 읽기 전용 트랜잭션을 거부한다. 호출 도메인의 변경과 QUEUED insert가 함께 커밋·롤백된다. worker는 별도 커넥션에서 커밋된 행만 선점한다. ID는 공통 UUIDv7 생성기를 사용한다.

```java
@Transactional
public JobRef request(UUID authenticatedUserId, UUID tripId) {
    // 도메인 권한·입력을 확인하고 필요한 도메인 변경을 수행한다.
    return jobs.submit(new JobSubmission(authenticatedUserId,
        JobKind.TRIP_RECOMMENDATION, tripId, allowedInputSnapshot,
        currentVersion, null));
}
```

위 예시는 해당 kind의 실제 handler와 policy를 등록한 뒤에만 동작한다. 요청 본문의 사용자 ID·권한 플래그를 신뢰하지 않는다. `JobSubmission`은 요청자, kind, nullable tripId, object 입력, nullable 양수 baseVersion, nullable `CleanupScope`를 받는다. 삭제 kind는 `CleanupScope(photoIds,messageIds,cutoffAt)`가 필수이며 불변 목록으로 복사한다. 재시도에서 신규 대상을 검색하지 않는다. 입력 JSON은 kind별 허용 입력 스냅샷이며 엔터티 관계를 대신하는 범용 저장소로 사용하지 않는다.

* `JobHandler.kind()`, `validate(submission)`, `execute(context)`, `complete(context,result)`를 구현한다. validate는 insert 전 필드 allowlist·크기·타입을 검사한다. execute는 DB 트랜잭션 밖에서 외부 I/O만 실행하고 `JobOutcome.succeeded(object)` 또는 `failed(JobFailure)`를 반환한다. 재시도할 일시 오류는 반드시 `failed(TEMPORARY_FAILURE)`로 반환한다. execute에서 던진 예외는 모두 재시도 없는 EXECUTION_FAILED로 처리한다. 실패 분류는 서버 enum이며 원문 예외를 공개하지 않는다.
* `JobAccessPolicy`는 `canSubmit`, `canExecute`, `canComplete`, `canRead` 네 단계와 `publicResult` allowlist projection을 모두 구현한다. 일반 AI는 각 단계에서 현재 ACTIVE 멤버십·동의·기준 version을 도메인 소유자가 재검사한다. 실행/완료 정책 철회는 CANCELLED다. 권한 검사와 완료 hook이 공유할 도메인 행은 같은 트랜잭션에서 잠가 TOCTOU를 방지한다.
* 동일 kind의 handler와 policy를 각각 정확히 하나 등록한다. 한쪽 누락·중복은 시작 실패다. 둘 다 없는 kind는 submit을 구성 오류로 거부한다.
* `JobContext(jobId,executionId,attempt,submission)`의 **jobId를 외부 공급자의 멱등 키**로 사용한다. executionId는 재선점 때마다 바뀌므로 외부 멱등 키로 쓰지 않는다.
* `complete`는 유효 executionId·미만료 임대를 확인하고 job 행을 잠근 뒤 호출된다. 결과 저장과 도메인 반영은 같은 짧은 트랜잭션이다. hook 실패 시 모두 롤백한다. 외부 I/O·자체 REQUIRES_NEW·별도 비동기 처리를 hook 안에서 하지 않는다. hook은 같은 jobId에 대해 도메인 차원에서도 멱등해야 한다.

## 실행·장애 보장

PostgreSQL `FOR UPDATE SKIP LOCKED`로 한 번에 하나 선점하고 짧은 트랜잭션을 끝낸다. 선점 대상은 이 인스턴스에 handler가 등록된 kind로 한정한다. 따라서 롤링 배포 중 구버전 인스턴스가 모르는 kind를 선점해 취소하지 않는다. 네트워크 실행은 고정 크기 ThreadPoolExecutor(concurrency 기본 2)에서 수행한다. 실행 슬롯(Semaphore)을 먼저 확보한 뒤에만 선점하므로 선점이 실행 스레드 수를 넘지 않는다. 슬롯은 실행 스레드가 실제로 반환될 때 돌려준다. 별도 단일 poll 스레드는 실행 완료를 기다리지 않으며 Clock 기준 timeout·heartbeat를 처리한다. 완료 시 execution_started_at 기준 timeout도 다시 확인한다.

정상 종료(@PreDestroy)로 interrupt된 실행은 실패로 확정하지 않고 RUNNING으로 남겨 둔다. 이 실행은 임대가 끝난 뒤 다른 인스턴스나 재시작한 인스턴스가 재선점한다. 이미 외부 부수 효과가 났을 수 있으므로 시도 횟수는 소모된 것으로 본다. 그래서 마지막 시도 중에 종료되면 FAILED(TIMEOUT)로 끝난다. 종료 시 실행은 최대 5초 기다린다. 선점은 했지만 실행이 시작되지 않은 경우(종료 중 실행 거부)에는 선점을 되돌리고 시도 횟수도 복구한다. 임대가 끝난 RUNNING은 새로운 executionId로 재선점하며 마지막 시도까지 소진한 행은 FAILED로 정리한다. 늦은 heartbeat·완료는 현재 executionId·임대가 다르면 무시하고 hook을 실행하지 않는다. 일시 장애와 timeout만 재시도하며 다음 실행 시각 전에는 선점하지 않는다. 영구 실패는 FAILED, 정책 철회는 CANCELLED다. 공개 오류는 JobFailure의 안전한 코드·문구만 사용하며 FAILED·CANCELLED 상태에서만 반환한다. 재시도 대기 중인 QUEUED 작업의 직전 오류는 공개하지 않는다. 입력·결과·외부 예외·DB 메시지·토큰을 worker가 로그로 출력하지 않는다.

**at-least-once** 기반이며 정확히 한 번의 외부 부수 효과를 보장하지 않는다. 프로세스 중단·응답 유실로 실행이 중복될 수 있다. timeout은 interrupt를 요청하며 이를 무시하는 실행은 계속 남을 수 있다. 이런 스레드는 executor 용량을 계속 차지해 새 외부 실행을 제한하고, 임대 fencing이 늦은 DB 완료를 차단한다. 외부 I/O 자체에도 공급자 timeout과 jobId 멱등성을 적용해야 한다. 모든 실행 스레드가 멈추면 해당 인스턴스의 새 실행은 진행하지 못하므로 운영 복구가 필요하다.

## 설정

`app.jobs`는 application.yaml에서 상속한다. 테스트 프로필은 `enabled=false`로 자동 실행만 끄고 pollOnce/tick과 주입 Clock으로 검증한다. 실제 .env를 읽거나 수정하지 않는다.

| 설정 | 기본값 |
| --- | --- |
| enabled | true |
| polling | 1s |
| timeout | 60s |
| lease | 120s |
| heartbeat | 20s |
| max-attempts | 3 (최초 포함, 설정 범위 1~3) |
| retry-delay | 30s (0 이상) |
| batch-size | 1 (다른 값은 시작 실패) |
| concurrency | 2 (범위 1~32) |

시간은 양수이며 polling ≤ heartbeat < timeout < lease여야 한다. 설정 누락·타입 오류·범위 불일치는 시작 실패다. 모든 DB 시각은 UTC timestamptz다.

## 공개 조회와 B 연결

조회는 활성 계정과 kind 정책을 매번 확인한다. 없는·삭제된·정책 거부·미등록 kind는 404 JOB_NOT_FOUND로 숨긴다. ACCOUNT_DELETE는 폴링을 제공하지 않는다. 정리는 최초 요청자만 이탈/여행 삭제 후 조회하며 ACTIVE 여행 멤버십을 공통 기반에서 요구하지 않는다. result는 `scope`(kind 문자열), `completedCount`, `failedCount`의 세 필드로 제한한다. 대상 ID·본문·파일은 반환하지 않는다. 일반 AI result는 도메인 정책의 명시적 publicResult projection을 사용한다.

B는 기본 나가기를 jobs 없이 200으로 구현한다. 향후 실제 정리를 지원할 때 (1) 고정 삭제 대상과 cutoff를 승인 트랜잭션에서 캡처하고 (2) 실제 handler와 네 단계 policy를 등록하고 (3) 도메인 변경과 submit을 함께 커밋한 뒤 (4) 실제 cleanupJobId와 202를 반환한다. 실행 및 완료에서 여행 이탈 때문에 승인된 정리가 취소되지 않도록 cleanup 정책을 설계한다. 아직 없는 삭제/보존 범위를 이 기반에서 결정하지 않는다.

## 검증

JobIntegrationTest는 실제 PostGIS PostgreSQL에서 도메인 rollback·커밋 전 비가시성, 동시 선점, 재시도·만료 복구·실행 fencing, timeout, hook 원자성, 단계별 권한, 최소 공개 결과, 인증·OpenAPI를 검증한다. JobConfigurationTest는 빈 registry와 잘못된 설정의 시작 실패를 검증한다. 긴 sleep과 외부 네트워크 실행기는 사용하지 않는다.
