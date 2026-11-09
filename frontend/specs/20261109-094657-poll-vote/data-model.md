# Data Model: 지역·장소 투표

## Poll (서버 응답, `PollResponse`)

| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | 투표 ID |
| tripId | string | 여행 ID |
| type | `REGION` 또는 `PLACE` | 유형 |
| title | string | 1~200자 |
| status | `OPEN`, `CLOSED`, `FINALIZED` | 진행 중 / 0표 마감 / 최다 후보 확정 |
| version | number | 후보 추가·마감 때만 오름 |
| closesAt | string(ISO) | 마감 시각 |
| closedReason | `DEADLINE`, `NO_VOTES`, null | 마감 이유 |
| eligibleMemberCount | number | 투표할 수 있는 동행 수(지금 ACTIVE, 마감 뒤 고정) |
| votedMemberCount | number | 투표한 동행 수 |
| candidates | PollCandidate[] | 입력·추가 순 |
| myCandidateIds | string[] | 내 선택 |
| selectedCandidateIds | string[] | 확정 후보(FINALIZED만, 동률이면 여럿) |

## PollCandidate

| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | 후보 ID |
| regionId | string 또는 null | 지역 투표면 값 |
| placeId | string 또는 null | 장소 투표면 값 |
| voteCount | number | 득표 |
| addedAt | string(ISO) | 들어온 시각 |

## 화면 상태 `PollViewState` (`poll-rules.pollViewState`)

| 값 | 조건 |
|----|------|
| `none` | 여행에 투표가 없음 |
| `open` | `OPEN`이고 지금 < closesAt |
| `closing` | `OPEN`인데 지금 ≥ closesAt(서버가 아직 마감 전) → 다시 받기 |
| `decided` | `FINALIZED`, 확정 후보 1개 |
| `tie` | `FINALIZED`, 확정 후보 2개 이상 |
| `noVotes` | `CLOSED` |

`decided`는 디자인 두 장을 같은 데이터로 그린다. 처음에는 마감 후 자동 확정 모양(201-11073, 결과 목록 + [확정된 여행지 보기])이고, 지역 투표에서 그 버튼을 누르면 같은 화면이 여행지 확정 모양(201-11569, 초록 확정 카드 + [장소 모으고 코스 짜기])으로 바뀐다. 장소 투표는 버튼 없이 첫 모양만 보인다. 미리보기는 두 모양을 각각 보인다.

## BallotDraft (화면 안)

| 필드 | 설명 |
|------|------|
| selected | 화면에 보이는 내 선택(낙관적) |
| saved | 서버에 마지막으로 저장된 내 선택 |
| failure | 마지막 실패 `{kind: conflict 또는 network, wanted}` 또는 null |

## SavedPlace (그룹 즐겨찾기, `SavedPlaceView`)

| 필드 | 설명 |
|------|------|
| place | `{id, name, address, latitude, longitude, regionId, provider, providerPlaceId, source}` |
| savedBy | `{memberId, memo}[]` |
| savedCount | 저장한 동행 수 |

## CandidateOption (N8·후보 추가 시트의 한 줄)

| 필드 | 설명 |
|------|------|
| key | 지역 ID 또는 장소 ID |
| title | 지역 이름 또는 장소 이름 |
| subtitle | 지역: "그룹 즐겨찾기 N곳", 장소: 주소 |
| input | `{regionId}` 또는 `{placeId}` |
