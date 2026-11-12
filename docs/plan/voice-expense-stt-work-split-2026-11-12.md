# 음성으로 공동 경비 입력 — 프론트·백엔드·AI 작업 분담

작성·수정일: 2026-11-12 (KST)

## 담당별 Jira

| 구분 | 이슈 |
| --- | --- |
| 전체 기능 | [EODI-338](https://jira.example.com/browse/EODI-338) |
| 프론트 | [EODI-339](https://jira.example.com/browse/EODI-339) |
| 백엔드 | [EODI-340](https://jira.example.com/browse/EODI-340) |
| AI | [EODI-341](https://jira.example.com/browse/EODI-341) |

하위 이슈는 담당 영역별 구현 작업이다. 문서 등록과 실제 기능 구현 완료를 구분한다.

## 1. 확정 방향

사용자가 한 번의 녹음에서 여러 지출을 말하면, STT와 구조화 추출을 거쳐 **경비별 초안 목록**을 만든다. 사용자가 각 항목을 확인·수정·삭제한 뒤 선택한 항목을 한 번에 저장한다. AI 결과만으로 경비를 자동 등록하지 않는다.

> 택시비 2만 4천 원 내가 냈고 나랑 민수랑 지연이 나눠. 커피 만 2천 원은 지연이가 냈고 나랑 지연이 둘이 나눠.

기대 결과는 택시비 24,000원과 커피 12,000원의 **초안 두 건**이다. 서로 다른 결제자·분담자를 각각 유지한다. 지출 시각처럼 말하지 않은 값은 만들어 넣지 않고 폼에서 확인한다.

| 항목 | 적용할 정책 | 결정 근거 |
| --- | --- | --- |
| 인증 키 | 기존 GMS_API_KEY 사용. 앱에 키를 넣지 않고 AI 서버에서 사용 | 사용자 확정 |
| 녹음 제한 | 최대 60초, 파일 한 개 최대 10MiB(10,485,760바이트) | 사용자 확정 |
| 녹음 형식 | Android·iOS 공통 M4A 컨테이너, AAC, 확장자 .m4a, 업로드 MIME audio/mp4 | 형식 선택을 위임받아 지정 |
| 녹음 설정 | expo-audio, 44,100Hz, 모노 1채널, 목표 비트레이트 64,000bps. 백그라운드 녹음 OFF | 담당자 공통 구현 기준 |
| 경비 건수 | 녹음에서 여러 경비를 추출. 1차 상한은 한 번에 10건. 초과 시 일부를 버리지 않고 나눠 녹음하도록 안내 | 복수 경비는 사용자 확정, 상한은 구현 기준 |
| 통화·분담 | KRW 양의 정수 금액, 기존 균등 분담 규칙 | 기존 경비 기능과 동일 |
| 원음 보관 | 분석 종료 후 서버 원음·변환 임시 파일 즉시 삭제. 성공뿐 아니라 실패·취소도 정리 | 사용자 삭제 방향 반영 |
| 자동 재시도 | 원음을 남겨두는 자동 재시도는 하지 않는다. 실패 시 사용자가 재전송·재녹음 | 즉시 삭제 정책에 맞춘 구현 기준 |
| 최종 저장 | 사용자 확인 후 일괄 저장. 한 항목 검증이 실패하면 전체 저장 취소 | 복수 경비 저장 구현 기준 |

음성 60초는 **녹음 길이 제한**이고, 아래 45초는 **녹음 전송 후 AI가 처리하는 시간 제한**이다. 서로 다른 시간이다.

### 처리 시간과 삭제의 의미

- AI 요청 전체 처리 예산: 최대 45초. 이 기능의 STT 호출 상한 25초, 구조화 LLM 호출 상한 15초, 나머지는 전처리·응답에 사용한다. 정상 응답이 항상 45초 걸린다는 의미는 아니다.
- 기존 백엔드 AI read timeout 50초와 worker timeout 60초는 유지한다. 다른 기능의 전역 제한을 바꾸지 않는다.
- 45초는 AI가 요청을 받은 뒤의 예산이다. 녹음 업로드·jobs 대기 시간은 별도이며 앱에는 접수/대기/인식/성공·실패를 구분해 표시한다. 근거 없는 남은 초 카운트다운을 만들지 않는다.
- 음성을 접수하자마자 삭제하면 worker가 읽을 수 없다. **대기·실행 중에만 비공개 임시 보관하고, 분석 호출 종료 후 즉시 삭제**한다.
- AI 서버는 STT 후 더 필요 없는 원음 버퍼·임시 파일을 먼저 해제한다. 백엔드 저장 원음은 AI 호출 종료·최종 작업 실패·취소 경로에서 정리한다.
- 통신 단절·서버 강제 종료는 가능하다. finally가 실행되지 않은 고아 원음은 독립 정리 작업으로 최대 10분 내 삭제한다. 이는 재시도를 위한 보관이 아니다.
- 앱 로컬 파일도 기본적으로 결과 수신 또는 사용자 취소 시 삭제한다. 업로드/처리 실패 시에만 화면에 머무는 동안 재전송할 수 있게 잠시 유지하고 화면 이탈·취소 시 삭제한다. 즉시 삭제된 경우 재녹음한다.
- 인식문·초안은 사용자 확인과 폼 복구를 위해 요청자 전용으로 최대 1시간 제공하고, 서버가 만료 후 결과를 지운다. 생성된 경비는 별도 데이터로 기존 보존 정책을 따른다.

GMS 사용은 확정이다. 다만 **실제 GMS의 STT 모델 이름·지원 요청 경로·선정 코덱의 정상 처리는 AI 담당이 첫 실제 호출로 검증해야 하는 구현 작업**이다. 문서 작성만으로 확인됐다고 표시하지 않는다. 지원이 안 되면 임의로 다른 공급자로 전환하지 않고 결과를 공유한다.

## 2. 기존 구현과 추가 범위

| 영역 | 재사용할 코드·기능 | 추가할 것 |
| --- | --- | --- |
| 앱 경비 폼 | frontend/src/features/expense/screens/expense-form-screen.tsx, components/expense-form-view.tsx | 녹음 UI와 복수 초안 확인 목록 |
| 앱 API·저장 | frontend/src/features/expense/api.ts, hooks/use-expense-mutations.ts | 분석 접수·폴링·일괄 저장 호출 |
| 단건 경비 저장 | POST /api/v1/trips/{tripId}/expenses, expense/dto/CreateExpenseRequest.java | 기존 API는 유지. 별도 일괄 저장 API 추가 |
| 백엔드 jobs | EodiLog/src/main/java/com/eodilog/job/ | VOICE_EXPENSE_DRAFT handler·권한 정책 |
| AI multipart 호출 | global/ai/AiServerClient.java | audio 파일 한 개와 meta 전송 |
| AI 서버 규칙 | ai/app/core/schemas.py, core/security.py | 기존 응답 봉투·내부 인증·trace ID 재사용 |
| GMS LLM 클라이언트 | ai/app/clients/gms.py | 구조화 추출에 재사용, STT 클라이언트 경계 별도 추가 |

기존 assets의 AssetPurpose·ImageFormat은 사진 중심이다. 오디오를 사진이나 캡처로 위장해 넣지 않는다. 음성 저장·검증·정리는 expense/voice 경계로 추가한다.

이번 범위는 모바일 앱이다. 웹 랜딩·카카오 복귀 페이지는 수정하지 않는다. 상시 녹음·화자 식별·실시간 자막·송금 실행·외화 환산·비율 분담은 포함하지 않는다.

## 3. 프론트 담당

### 녹음

- [ ] 기존 경비 폼에 ‘말로 입력’ 버튼과 녹음 화면을 추가한다. 수동 입력은 유지한다.
- [ ] expo-audio를 추가하고 마이크 권한·거부 안내·필요한 앱 설정·개발 빌드 재빌드를 처리한다.
- [ ] M4A/AAC, 모노 44,100Hz·64kbps를 Android/iOS에 명시한다. 기본 프리셋만 믿지 않는다. Android의 저품질 프리셋은 다른 형식이 될 수 있다.
- [ ] 최대 60초에서 자동 종료하고, 10MiB 초과는 전송 전 안내한다. 서버 검증도 별도로 수행한다.
- [ ] 시작·종료·취소·재녹음·파일 정리와 통화·앱 이탈 등 녹음 중단을 처리한다.
- [ ] 실제 Android/iOS 파일 샘플 한 개씩을 AI·백엔드에 전달하고 정상 인식을 확인한다.

### 여러 초안 확인과 저장

- [ ] 분석 접수 후 jobs 상태를 폴링한다. 화면 이탈 시 폴링을 중지한다. 폴링 중지는 서버 작업 취소와 다르다.
- [ ] 접수 응답만 유실돼 같은 요청을 다시 보내는 경우는 동일 분석 키를 유지한다. 이미 FAILED로 끝난 작업을 사용자가 다시 분석하는 경우는 파일 재전송·새 분석 키로 새 작업을 만든다.
- [ ] 전체 인식문과 항목별 초안 목록을 보여준다. 각 항목의 금액·결제자·분담자·시각을 수정하거나 항목을 제외할 수 있게 한다.
- [ ] 한 항목의 미확정 정보가 다른 항목과 섞이지 않게 draftId로 구분한다.
- [ ] 동명이인·없는 이름·누락 금액은 직접 선택·입력하도록 표시한다. 사용자가 수정한 폼을 늦게 도착한 응답으로 덮어쓰지 않는다.
- [ ] 지출 시각이 없으면 기존 폼 기본값을 사용할 수 있지만, AI가 인식한 시각인 것처럼 표시하지 않는다.
- [ ] 인식문 텍스트를 고치는 것만으로 자동 재분석되지 않는다. 1차는 초안 필드를 직접 고치거나 재녹음한다.
- [ ] 선택한 1~10건을 일괄 저장 API로 전송한다. 저장 요청 키는 음성 분석 키와 별개이며 동일 저장 재시도에는 같은 키를 사용한다.
- [ ] 저장 중 중복 클릭을 막고, 성공한 전체 경비 목록과 정산 상태 캐시를 갱신한다. 실패하면 수정 중인 목록을 유지한다.

## 4. 백엔드 담당

### 음성 분석 작업

- [ ] expense/voice 하위에 접수 API·DTO·service를 추가한다. JobKind.VOICE_EXPENSE_DRAFT, handler, 요청자 전용 access policy를 등록한다.
- [ ] jobs의 DB enum/check 제약을 확인하고 필요하면 새 마이그레이션을 추가한다. 아래 오류 매핑의 VOICE_* JobFailure도 백엔드 담당이 공통 enum에 추가하며 모두 retryable=false로 정의한다.
- [ ] 인증된 현재 ACTIVE 여행 멤버만 접수한다. 결과는 요청자만 조회하고, 이탈·여행 삭제·결과 만료 때 접근을 차단한다.
- [ ] 60초·10MiB와 M4A/AAC 실내용을 검증한다. MIME·확장자만 믿지 않고 컨테이너·코덱·실제 길이를 검사한다. 서버 배포 이미지에 제한 시간 있는 메타데이터 검사 도구(예: ffprobe)를 준비한다.
- [ ] 음성을 비공개 임시 객체로 저장한다. job JSON에는 바이트가 아닌 내부 저장 참조만 넣는다. 저장 후 등록 실패 시 고아 파일을 정리한다.
- [ ] 멱등 지문은 파일 내용 해시·tripId 등 의미 있는 입력으로 만든다. multipart boundary·파일명 변화는 같은 파일의 재전송을 다른 요청으로 만들지 않아야 한다.
- [ ] 트랜잭션 밖에서 AI를 호출하고 기존 내부 토큰·trace ID·50초 read timeout을 재사용한다.
- [ ] 이 작업은 자동 STT 재시도를 하지 않는다. 현재 공통 max-attempts=3을 전역 변경하지 말고 이 종류의 실패를 최종 실패로 처리한다. lease 회수·프로세스 중단 후에도 이미 종료된 음성 처리를 무심코 반복 실행하지 않게 한다.
- [ ] 성공·실패·타임아웃·취소·만료 시 원음을 즉시 정리하고, 강제 종료로 남은 객체는 독립 청소 작업으로 제거한다. 삭제 실패도 모니터링하고 재정리한다.
- [ ] 인식문·초안은 요청자 전용으로 1시간 후 만료·삭제한다. 공개 URL·음성 전문·키를 일반 로그에 남기지 않는다.

### 의미 해석과 일괄 저장

- [ ] ‘나/내가’는 인증된 요청자의 여행 memberId로 해석한다. userId와 혼동하지 않는다.
- [ ] AI의 이름 표현을 실제 여행 멤버와 대조한다. 동명이인·없는 이름은 임의로 확정하지 않는다.
- [ ] 결제자와 분담자를 별도로 해석한다. ‘셋이’라는 숫자만으로 세 명을 고르지 않고, ‘내가 냈다’만으로 요청자를 분담자에 넣지 않는다.
- [ ] 초안마다 draftId를 발급하고 최대 10건, 금액·통화·배열·시간·이름 표현을 검증한다.
- [ ] 초안 생성으로 expenses·expenseVersion·정산 상태를 변경하지 않는다.
- [ ] POST /api/v1/trips/{tripId}/expenses/batch를 추가한다. 1~10건을 단일 트랜잭션으로 저장하고 한 건이라도 잘못되면 전부 취소한다.
- [ ] 기존 ExpenseService의 권한·경비 DTO 검증·원금 균등 분담을 공통 로직으로 재사용한다. 별도의 AI용 정산 계산을 만들지 않는다.
- [ ] batch 전체에 Idempotency-Key를 적용한다. 같은 키·같은 목록은 같은 결과, 같은 키·다른 목록은 충돌이다. 단건 POST를 앱에서 반복 호출해 부분 저장이 생기게 하지 않는다.
- [ ] 최종 저장 시 현재 멤버 상태를 다시 검증하고 기존 expenseVersion 갱신·정산 무효화 규칙을 유지한다.
- [ ] Swagger·API 명세·오류 코드·파일/인식문 만료 정책을 갱신한다.

## 5. AI 담당

- [ ] 기존 GMS_API_KEY와 GMS 호출 경로를 사용해 STT 모델·전사 API를 실제 확인한다. 임의의 타 공급자 키를 요구하지 않는다.
- [ ] ai/app/clients/에 STT 클라이언트, ai/app/features/voice_expense/에 multipart 라우터·서비스·Pydantic 스키마를 추가한다.
- [ ] M4A/AAC 모바일 샘플을 처리하고 실제 길이·형식도 재검증한다. 필요 시 AI 서버 내부에서만 공급자가 요구하는 형식으로 변환하고 임시 파일을 정리한다.
- [ ] STT 텍스트에서 여러 경비를 분리해 배열로 반환한다. 항목별 결제자·분담자·일시 표현과 원문 근거를 연결한다.
- [ ] ‘택시 2만 원, 커피 만 원, 합계 3만 원’은 경비 두 건이다. 합계를 세 번째 경비로 만들지 않는다.
- [ ] ‘택시 만이천 원, 아니 만오천 원’ 같은 명시적 정정은 한 건으로 해석한다. 모호하면 확인 필요 안내를 남긴다.
- [ ] ‘둘 다 내가 냈어’처럼 여러 항목에 적용되는 표현을 반영하되 근거 없는 문맥 확장은 하지 않는다.
- [ ] 한국어 금액을 원 단위 정수로 추출한다. 빠진 금액·이름·정확한 시각을 만들지 않는다. 임의의 confidence 수치도 만들지 않는다.
- [ ] 화자의 ‘나’는 SELF 표현으로 반환하고 실제 memberId를 추측하지 않는다.
- [ ] 상대 날짜는 meta.referenceAt과 Asia/Seoul을 기준으로 해석한다. 날짜와 시각을 충분히 특정할 수 있으면 spentAt을 UTC ISO-8601로 반환한다. ‘어제 저녁’처럼 시·분이 없으면 spentAt=null로 두고 spentAtExpression에 원문을 남긴다. 백엔드는 AI의 시각 형식·문맥을 검증하고, 프론트는 미확정 시각을 사용자가 채우게 한다.
- [ ] 전체 요청 45초 내에서 STT 25초·구조화 15초 상한을 적용한다. 10건 처리에 실제로 충분한지 측정하고 모자라면 담당자에게 근거를 공유한다.
- [ ] 무음·불명확한 음성·11건 이상·외화·비율 분담은 정해진 오류/확인 필요 결과를 반환한다. 일부를 조용히 누락하거나 다른 금액으로 바꾸지 않는다.
- [ ] 음성 내용은 데이터로 취급하고 발화 안의 시스템 명령을 따르지 않는다. 로그에는 소요 시간·모델·오류 분류만 남긴다.

## 6. 프론트 ↔ 백엔드 계약

### 음성 접수·결과

```text
POST /api/v1/trips/{tripId}/expense-voice-drafts
Authorization: Bearer ...
Idempotency-Key: ...
Content-Type: multipart/form-data

audio: recording.m4a (audio/mp4), 한 개
```

202 + 기존 JobRef를 반환하고 GET /api/v1/jobs/{jobId}로 조회한다. 성공 result 구조는 다음과 같다. drafts는 단건 객체가 아니라 **배열**이다.

```json
{
  "transcript": "택시비 2만 4천 원 내가 냈고 나랑 민수랑 지연이 나눠. 커피 만 2천 원은 지연이가 냈고 나랑 지연이 둘이 나눠.",
  "drafts": [
    {
      "draftId": "초안-1-UUID",
      "transcriptSegment": "택시비 2만 4천 원 내가 냈고 나랑 민수랑 지연이 나눠",
      "draft": {
        "title": "택시비", "memo": null, "amountMinor": 24000, "currency": "KRW",
        "payerMemberId": "요청자-memberId",
        "participantMemberIds": ["요청자-memberId", "민수-memberId", "지연-memberId"],
        "spentAt": null
      },
      "unresolvedFields": ["spentAt"],
      "warnings": []
    },
    {
      "draftId": "초안-2-UUID",
      "transcriptSegment": "커피 만 2천 원은 지연이가 냈고 나랑 지연이 둘이 나눠",
      "draft": {
        "title": "커피", "memo": null, "amountMinor": 12000, "currency": "KRW",
        "payerMemberId": "지연-memberId",
        "participantMemberIds": ["요청자-memberId", "지연-memberId"],
        "spentAt": null
      },
      "unresolvedFields": ["spentAt"],
      "warnings": []
    }
  ],
  "warnings": []
}
```

예시의 ID 라벨은 설명용이며 실제 응답은 UUID 문자열이다. 초안에는 null·빈 배열을 허용하지만 최종 저장의 필수 검증은 완화하지 않는다. 날짜나 멤버가 모호한 항목만 확인 필요로 표시하고 다른 정상 초안까지 버리지 않는다.

### 사용자 확인 후 일괄 저장

```text
POST /api/v1/trips/{tripId}/expenses/batch
Idempotency-Key: ...
Content-Type: application/json
```

본문은 `{ "items": [ExpenseWrite, ExpenseWrite] }`이며 각 ExpenseWrite는 기존 단건 필드(title, memo, amountMinor, currency, payerMemberId, participantMemberIds, spentAt)를 사용한다. spentAt은 사용자가 확인한 UTC ISO-8601 시각이다. 201 응답은 `{ "data": { "expenses": [Expense, Expense] } }`로 입력 순서와 대응한다.

서버는 0건·11건 이상, 잘못된 금액·멤버·시간·중복 분석 요청을 구분한다. 저장 전체를 원자적으로 처리하되 단건 경비 API는 그대로 유지한다. 동일한 내용의 서로 다른 실제 지출은 있을 수 있으므로 내용이 같다는 이유만으로 임의 삭제하지 않는다.

## 7. 백엔드 ↔ AI 계약

```text
POST /ai/v1/voice-expense-drafts
X-Internal-Token: ...
X-Trace-Id: jobId
Content-Type: multipart/form-data

audio: recording.m4a (audio/mp4)
meta: {"language":"ko","timeZone":"Asia/Seoul","referenceAt":"서버 UTC 기준 시각"}의 JSON 문자열
```

AI는 `{data: ...}` 봉투를 유지하고 data에 `transcript`, `items`, `warnings`를 반환한다. items는 1~10건이며 각 항목은 다음 구조다.

```json
{
  "transcriptSegment": "택시비 2만 4천 원 내가 냈고 나랑 민수랑 지연이 나눠",
  "title": "택시비",
  "memo": null,
  "amountMinor": 24000,
  "currency": "KRW",
  "payer": {"kind": "SELF", "name": null},
  "participants": {"mode": "NAMED", "includeSpeaker": true, "names": ["민수", "지연"], "headcount": 3},
  "spentAt": null,
  "spentAtExpression": null,
  "warnings": []
}
```

- payer.kind: SELF | NAMED | UNKNOWN. participants.mode: NAMED | ALL_ACTIVE | UNKNOWN. includeSpeaker는 모호하면 null.
- ‘우리 모두’처럼 분명한 표현만 ALL_ACTIVE로 해석한다. 결제·분담의 실제 멤버 매핑과 권한은 백엔드가 담당한다.
- 경고 형식: `{ "code": "AMOUNT_MISSING", "field": "amountMinor", "message": "금액을 확인해 주세요." }`. 경고는 draft별 또는 전체에 붙인다.
- 최소 경고 코드: AMOUNT_MISSING, PAYER_UNKNOWN, PARTICIPANTS_UNKNOWN, MEMBER_AMBIGUOUS, MEMBER_NOT_FOUND, SPENT_AT_UNKNOWN, COUNT_MISMATCH. 멤버 모호성은 백엔드 해석 단계에서 추가한다.
- 업무 오류: 잘못된 파일은 400 VALIDATION_ERROR, 시간·크기·건수 초과는 422 INPUT_LIMIT_EXCEEDED, 무음·의미 있는 경비를 찾지 못함은 422 INSUFFICIENT_DATA, 외화·비율 분담은 422 VOICE_EXPENSE_UNSUPPORTED, 공급자 장애·처리 예산 초과는 503 PROVIDER_UNAVAILABLE.
- 백엔드는 기존 jobs의 error `{code,message}` 형식을 유지한다. 접수 단계의 파일·크기 검증 실패는 HTTP 오류로 직접 반환하고, 접수 후 비동기 처리의 실패는 아래 코드로 매핑한다. 클라이언트가 알 수 없는 AI 공급자 원문을 그대로 전달하지 않는다.

| 접수 후 실패 원인 | jobs.error.code | 프론트 동작 |
| --- | --- | --- |
| 잘못된 오디오·디코딩 실패 | VOICE_AUDIO_INVALID | 형식 안내 후 재녹음 |
| 60초·10MiB·10건 초과가 처리 중 확인됨 | VOICE_INPUT_LIMIT_EXCEEDED | 제한 안내 후 나눠 녹음 |
| 무음·경비 추출 불가 | VOICE_NO_SPEECH_OR_EXPENSE | 재녹음 또는 수동 입력 |
| 외화·비율 분담 | VOICE_EXPENSE_UNSUPPORTED | 지원 범위 안내 후 직접 수정/입력 |
| GMS·네트워크 장애 | VOICE_PROVIDER_UNAVAILABLE | 원음이 남아 있으면 사용자 재전송, 없으면 재녹음 |
| AI 예산·worker 처리 시간 초과 | VOICE_PROCESSING_TIMEOUT | 사용자 재전송·재녹음 안내 |
| lease 만료 후 원음이 없거나 실행 중단이 확인됨 | VOICE_PROCESSING_INTERRUPTED | 이전 음성을 자동 재실행하지 않고 새 요청 안내 |

위 코드는 새로 추가할 서버 소유 코드이며 현재 enum에 이미 있다는 뜻은 아니다. worker가 만드는 TIMEOUT·lease 회수에도 이 kind의 재시도 제한이 적용되어야 한다. 초안 만료·다른 요청자의 조회는 기존 404 JOB_NOT_FOUND를 사용하고, 권한을 가진 요청자의 FAILED 작업 조회는 HTTP 200 Job 안의 status/error로 실패를 전달한다.

## 8. 녹음 규격 구현 참고

`npx expo install expo-audio`로 현재 앱 SDK에 맞는 버전을 추가한다. HIGH_QUALITY 프리셋을 바탕으로 extension=.m4a, sampleRate=44100, numberOfChannels=1, bitRate=64000을 명시적으로 덮어쓴다. Android는 outputFormat=mpeg4/audioEncoder=aac, iOS는 IOSOutputFormat.MPEG4AAC를 사용한다. 서버의 최대 크기는 파일 바이트 기준으로 검사한다.

Web 녹음은 1차 지원 범위가 아니다. 웹 기본 프리셋의 WebM을 모바일 공통 M4A 계약과 혼동하지 않는다. 선택한 규격은 Android/iOS 실제 녹음 샘플을 STT에 넣는 통합 검증으로 확인한다.

참고: [Expo Audio 공식 녹음 옵션](https://docs.expo.dev/versions/latest/sdk/audio/).

## 9. 선행 작업과 병렬 순서

1. AI는 기존 GMS 키로 STT 실제 호출을 확인하고, 프론트는 지정한 규격의 Android/iOS 샘플을 만든다. 모델 이름·경로는 검증 결과를 공유한다.
2. 세 담당자가 이 문서의 배열 응답·경고·일괄 저장 DTO를 공통 fixture로 만든다. 사용자에게 같은 정책을 다시 묻는 대신 구현 불일치만 조정한다.
3. 프론트는 mock으로 녹음·복수 초안 UI를, 백엔드는 AI 대역으로 jobs·멤버 해석·batch 저장을, AI는 STT·복수 항목 추출을 병렬 구현한다.
4. 실제 음성 → 복수 초안 → 사용자 수정 → 전체 경비 저장을 연결한다.
5. 관련 기능 테스트와 실제 기기 녹음을 검증한다. 이번 문서 작성 때문에 전체 빌드를 반복하지 않는다.

공통 JobKind·migration·AI client·앱 설정 변경은 담당 파일 목록과 메서드 계약을 먼저 공유한다. 최종 경비는 기존 1원 잔여 배분·정산 올림 로직을 그대로 사용한다.

## 10. 완료 시나리오

| 입력·상태 | 기대 결과 |
| --- | --- |
| 서로 다른 결제자·분담자의 지출 두 건 | 초안 두 건을 구분하고 각각 정확히 연결 |
| 택시 2만 원·커피 만 원·합계 3만 원 | 합계를 경비로 추가하지 않고 두 건 추출 |
| 금액 말하다 정정 | 정정된 한 건 또는 확인 필요 표시 |
| 한 건의 금액만 누락 | 해당 항목만 보완 표시, 다른 초안 유지 |
| 닉네임 중복·이름 미확인·셋이라는 숫자만 있음 | 멤버 임의 선택 금지 |
| 60초·10MiB 이내 / 초과 | 정상 접수 / 제한 오류. 프론트와 서버 모두 확인 |
| 무음·인식 불가·11건 이상·외화 | 안내 가능한 오류, 일부를 조용히 버리지 않음 |
| AI 오류·통신 실패·타임아웃·취소 | 경비 생성 없음, 원음 삭제. 재시도는 사용자 재전송·재녹음 |
| 처리 프로세스 강제 종료 | 남은 임시 음성 고아 객체 청소 |
| batch의 두 번째 항목이 잘못됨 | 첫 항목도 저장되지 않음 |
| 일괄 저장 재전송·연속 클릭 | 같은 저장 키로 경비 목록 한 번만 생성 |
| 사용자 폼 수정 후 늦은 응답 | 사용자 입력 유지 |
| 이탈·삭제·다른 멤버의 작업 조회 | 접근 차단 |
| 초안 조회 1시간 경과 | 인식문·초안 만료·정리, 이미 저장한 경비는 유지 |

## 11. 현재 상태

문서에 사용자 결정과 구현 기준을 반영했다. 이전 문서의 ‘한 음성=경비 한 건’과 원음 보관 재시도 제안은 이 버전으로 대체한다. 녹음·STT·신규 API·일괄 저장 코드는 아직 구현하지 않았다. 사용자의 문서 업로드 요청에 따라 이 문서만 버전 관리하며 실제 구현은 위 담당별 이슈로 진행한다.
