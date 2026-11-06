# 캡처 평가 세트 (합성 스크린샷 50장)

화면 S11에서 사용자가 올리는 "캡처"를 흉내 낸 합성 스크린샷으로 장소 추출(PLACE_EXTRACTION)을 평가한다.
`eval_data/places`는 간판 사진이라 실제 캡처(지도앱 화면, 블로그, SNS, 채팅)를 다루지 못한다. 이 세트가 그 빈틈을 채운다.

커밋하는 파일은 `labels.json`, 이 README, 생성 스크립트 `ai/scripts/make_captures.py`, 채점 스크립트 `ai/scripts/score_captures.py`다.
이미지(`images/`)와 결과(`results/`)는 커밋하지 않는다. 스크립트로 다시 만든다.

## 만드는 법

```bash
cd ai
# 사진은 eval_data/photos(AI 생성 사진)에서 가져온다. 폴더가 없으면 단색 자리 표시로 그린다
uv run --with playwright python -m scripts.make_captures --photos eval_data/photos
```

- HTML 목업을 Playwright로 휴대폰 크기(360x780 CSS px, 배율 3 → **1080x2340**)로 렌더링한다. 12장은 위쪽만 남긴 잘린 크기(1080x1290~1080x1920)다.
- Playwright 기본 chromium이 없으면 설치된 Edge(`msedge`)나 Chrome으로 렌더링한다. 이번 세트는 Windows Edge로 만들었다(글꼴: 맑은 고딕).
- 실제 서비스의 로고·이름·UI 자산은 쓰지 않았다. 앱 이름은 `지도앱`, `블로그`, `SNS`, `채팅`, `날씨`, `설정`이다.
- 장소는 부산·강릉·제주·서울의 널리 알려진 관광지·식당·카페다(네이버 검색으로 찾을 수 있는 이름). 주소는 동 수준까지만 쓴다.
- 리뷰어, 블로그 작성자, SNS 계정, 채팅 상대는 모두 지어낸 이름이다. 전화번호 같은 개인정보는 없다.
- 사진은 `eval_data/photos`의 AI 생성 음식·풍경 사진을 다시 쓰고, 없는 자리는 단색 그라데이션이다.
- 생성할 때 화면에 실제로 보이는 글자(잘려 넘친 글자 제외)를 `images/visible_text.json`에 남기고, 정답 장소가 화면 글자에 있는지 검사한다(잘린 장소는 제외).

## 구성

| 종류 (`type`) | 장수 | 정답 장소 수 | 내용 |
| --- | --- | --- | --- |
| `detail` | 12 | 12 | 지도앱 장소 상세(사진, 이름, 업종, 별점, 주소, 영업시간, 리뷰). 3장은 잘린 크기 |
| `list` | 8 | 32 | 지도앱 검색 결과 목록, 3~5곳 |
| `blog` | 8 | 15 | 블로그 글, 사진과 본문에 1~3곳 |
| `sns` | 6 | 6 | SNS 게시물, 해시태그(5장) 또는 위치 태그(1장)에 장소 |
| `chat` | 6 | 12 | 친구 채팅에서 장소 언급. 1장은 지도앱 링크 카드 포함 |
| `hard` | 4 | 10 | 작은 글씨(`small_text`), 다크 모드(`dark`), 이름이 화면 위에서 잘림(`cut`), 광고 섞임(`ads`) |
| `negative` | 6 | 0 | 음식 사진 SNS 2장, 날씨 화면 2장, 설정 화면 1장, 장소 없는 채팅 1장 |

## 정답표 (`labels.json`)

```json
"c13_list.png": {
  "type": "list",
  "expected": ["태종대", "태종대유원지", "해동용궁사", "..."],
  "places": [["태종대", "태종대유원지"], ["해동용궁사"], "..."],
  "also_visible": ["지도앱", "부산", "부산 영도구", "관광명소", "..."]
}
```

- `places`: 찾아야 하는 장소마다 인정하는 표기 목록. 첫 번째가 화면에 쓴 이름이다. 정규화(`app.core.text.normalize`: NFKC, 소문자, 글자·숫자만) 뒤 완전히 같아야 한다.
- `expected`: `places`를 펼친 목록. `scripts/eval_places.py`의 `score_image`와 호환된다(하나라도 맞으면 `correct`).
- `also_visible`: 화면에 보이지만 장소가 아닌 글자(지역명, 업종, 역 이름, 앱 이름, 해시태그, 사람 이름, 광고). 나와도 정답이 아니고, 지어낸 이름으로도 세지 않는다.
- `hard`, `cut`, `size`: 어려운 사례 종류, 잘린 장소, 잘린 캡처의 픽셀 크기.
- 지역명만 있는 경우는 장소가 아니다(spec §2 프롬프트 규칙). 그래서 `해운대`, `광안리` 같은 지역명 단독 표기는 정답 표기에 넣지 않았다.
- 정답표는 생성 스크립트의 데이터로 만들고, 모델을 돌리기 전에 고정했다. 결과를 보고 고치면 사유를 기록하고 다시 채점한다.

## 평가 실행

```bash
cd ai
uv run python -m scripts.eval_places --models gpt-5.6-luna --no-places --data-dir eval_data/captures
# 결과: eval_data/captures/results/gpt-5.6-luna.jsonl. 회차마다 파일 이름을 바꿔 둔다(같은 이름이면 이어서 돈다)
uv run python -m scripts.score_captures eval_data/captures/results/run1-gpt-5.6-luna.jsonl
```

`score_captures`는 장소마다 찾았는지(재현율), 사진 전체 정답(모든 장소를 찾고 장소 아닌 이름을 내지 않음),
음성 캡처에서 아무 이름도 내지 않았는지, 정답표 밖 이름(`unexpected`)과 그중 화면 글자에도 없는 이름(지어낸 이름 후보)을 센다.

결과 보고서: `ai/docs/reports/capture-eval.md`

## 한계

합성 화면이라 실제 캡처보다 깨끗하다. 글꼴 하나, 압축 잡음 없음, 실제 앱의 복잡한 배치·배너·이모지·알림 없음.
실제 사용자 캡처로 다시 재야 한다.
