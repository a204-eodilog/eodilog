"""준비물 제안 (spec §7, T-07-1 ~ T-07-6). 실제 클라이언트에 HTTP 응답만 고정한다."""

import json

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

PATH = "/ai/v1/checklist-suggestions"
GMS_URL = "https://gms.test/v1/chat/completions"
TOKEN = "secret-token"
JOB_ID = "11111111-1111-1111-1111-111111111111"
ALWAYS = ["신분증", "충전기"]
OVERNIGHT = ["세면도구", "갈아입을 옷"]


@pytest.fixture
def client() -> TestClient:
    settings = Settings(
        _env_file=None,
        internal_api_token=TOKEN,
        gms_api_key="k",
        gms_base_url="https://gms.test/v1",
    )
    test_client = TestClient(create_app(settings), raise_server_exceptions=False)
    test_client.headers["X-Internal-Token"] = TOKEN
    return test_client


def llm_response(content) -> httpx.Response:
    text = content if isinstance(content, str) else json.dumps(content, ensure_ascii=False)
    return httpx.Response(200, json={"choices": [{"message": {"content": text}}]})


@pytest.fixture
def llm():
    """기본은 LLM이 아무것도 더하지 않는다. 필요한 테스트만 응답을 바꾼다."""
    with respx.mock(assert_all_called=False) as router:
        yield router.post(GMS_URL).mock(return_value=llm_response({"items": []}))


def weather(date="2026-11-14", low=12, high=18, rain=0.1, hourly=()) -> dict:
    return {
        "placeId": "p1",
        "date": date,
        "queriedAt": "2026-11-13T00:00:00Z",
        "forecastAt": "2026-11-13T00:00:00Z",
        "source": "open-meteo",
        "condition": "CLOUDY",
        "temperatureCelsius": 15,
        "minCelsius": low,
        "maxCelsius": high,
        "precipitationProbability": rain,
        "hourly": list(hourly),
        "stale": False,
    }


def hour(at: str, rain) -> dict:
    return {
        "at": at,
        "condition": "RAIN",
        "temperatureCelsius": 11,
        "precipitationProbability": rain,
    }


def item(
    name="어떤 곳", category=None, day=1, order=1, start=None, stay=None, place_id=None
) -> dict:
    return {
        "id": None,
        "place": {
            "id": place_id or f"{name}-id",
            "name": name,
            "address": "부산 어딘가 1",
            "latitude": 35.0,
            "longitude": 129.0,
            "regionId": None,
            "provider": "NAVER",
            "providerPlaceId": "x",
            "source": "PROVIDER",
            "category": category,
        },
        "day": day,
        "order": order,
        "startTime": start,
        "stayMinutes": stay,
    }


def body(
    *,
    start="2026-11-14",
    end="2026-11-14",
    forecasts=(),
    items=(),
    existing=(),
    deleted=(),
) -> dict:
    return {
        "jobId": JOB_ID,
        "trip": {"startDate": start, "endDate": end},
        "weather": list(forecasts) or [weather()],
        "items": list(items),
        "existingItems": [
            {"label": label, "source": "MANUAL", "modifiedByUser": False} for label in existing
        ],
        "deletedLabels": list(deleted),
    }


def suggestions(response: httpx.Response) -> dict[str, str]:
    assert response.status_code == 200, response.text
    items = response.json()["data"]["items"]
    assert all(entry["sourceJobId"] == JOB_ID for entry in items)
    return {entry["label"]: entry["reason"] for entry in items}


def test_T07_1_rain_suggests_umbrella_and_raincoat(client, llm):
    found = suggestions(client.post(PATH, json=body(forecasts=[weather(rain=0.7)])))
    assert found["우산"] == "비 70%"
    assert "우비" in found


def test_rain_below_threshold_suggests_nothing_for_rain(client, llm):
    found = suggestions(client.post(PATH, json=body(forecasts=[weather(rain=0.59)])))
    assert "우산" not in found


def test_hourly_rain_counts_and_reason_uses_korean_morning(client, llm):
    # 01:00Z는 한국 시각 10:00
    forecast = weather(rain=None, hourly=[hour("2026-11-14T01:00:00Z", 0.7)])
    assert suggestions(client.post(PATH, json=body(forecasts=[forecast])))["우산"] == "오전 비 70%"


def test_hourly_rain_reason_uses_korean_afternoon(client, llm):
    forecast = weather(rain=0.2, hourly=[hour("2026-11-14T06:00:00Z", 0.8)])
    assert suggestions(client.post(PATH, json=body(forecasts=[forecast])))["우산"] == "오후 비 80%"


def test_rain_reason_names_the_day_on_a_multi_day_trip(client, llm):
    forecasts = [weather("2026-11-14", rain=0.2), weather("2026-11-15", rain=0.9)]
    request = body(end="2026-11-15", forecasts=forecasts)
    assert suggestions(client.post(PATH, json=request))["우산"] == "11월 15일 비 90%"


def test_cold_day_suggests_warm_items(client, llm):
    found = suggestions(client.post(PATH, json=body(forecasts=[weather(low=5)])))
    assert found["두꺼운 외투"] == "최저 5°"
    assert "손난로" in found


def test_mild_day_does_not_suggest_warm_items(client, llm):
    assert "손난로" not in suggestions(client.post(PATH, json=body(forecasts=[weather(low=6)])))


def test_hot_day_suggests_sun_items(client, llm):
    found = suggestions(client.post(PATH, json=body(forecasts=[weather(high=28)])))
    assert found["선크림"] == "최고 28°"
    assert "모자" in found


def test_warm_day_does_not_suggest_sun_items(client, llm):
    assert "선크림" not in suggestions(client.post(PATH, json=body(forecasts=[weather(high=27)])))


def test_unknown_weather_values_suggest_nothing_for_weather(client, llm):
    found = suggestions(
        client.post(PATH, json=body(forecasts=[weather(low=None, high=None, rain=None)]))
    )
    assert set(found) == set(ALWAYS)


def test_T07_2_two_walking_places_suggest_shoes(client, llm):
    items = [item("민락 수변공원", order=1), item("감천문화마을", "여행 > 관광,명소", order=2)]
    assert suggestions(client.post(PATH, json=body(items=items)))["편한 운동화"] == "걷는 장소 2곳"


def test_one_walking_place_or_a_repeated_place_is_not_enough(client, llm):
    items = [
        item("민락 수변공원", order=1),
        item("민락 수변공원", order=2),
        item("식당", "음식점", order=3),
    ]
    assert "편한 운동화" not in suggestions(client.post(PATH, json=body(items=items)))


def test_long_day_suggests_battery(client, llm):
    items = [
        item("가", start="10:00", stay=60, order=1),
        item("나", start="17:00", stay=60, order=2),
    ]
    assert suggestions(client.post(PATH, json=body(items=items)))["보조배터리"] == "하루 8시간 일정"


def test_short_day_or_unknown_times_do_not_suggest_battery(client, llm):
    short = [
        item("가", start="10:00", stay=60, order=1),
        item("나", start="16:59", stay=60, order=2),
    ]
    unknown = [item("가", order=1), item("나", order=2)]
    assert "보조배터리" not in suggestions(client.post(PATH, json=body(items=short)))
    assert "보조배터리" not in suggestions(client.post(PATH, json=body(items=unknown)))


def test_hours_are_not_added_across_different_days(client, llm):
    items = [
        item("가", start="10:00", stay=60, day=1),
        item("나", start="18:00", stay=60, day=2),
    ]
    assert "보조배터리" not in suggestions(client.post(PATH, json=body(items=items)))


def test_beach_suggests_spare_socks(client, llm):
    found = suggestions(client.post(PATH, json=body(items=[item("광안리해수욕장")])))
    assert found["여벌 양말"] == "광안리해수욕장 일정"


def test_same_day_trip_gets_basics_only(client, llm):
    assert set(suggestions(client.post(PATH, json=body()))) == set(ALWAYS)


def test_overnight_trip_adds_overnight_items(client, llm):
    found = suggestions(client.post(PATH, json=body(end="2026-11-15")))
    assert set(found) == set(ALWAYS + OVERNIGHT)
    assert found["세면도구"] == "1박 일정"


def test_missing_trip_dates_are_treated_as_not_overnight(client, llm):
    request = body()
    request["trip"] = {"startDate": None, "endDate": None}
    assert set(suggestions(client.post(PATH, json=request))) == set(ALWAYS)


def test_T07_3_existing_item_is_not_suggested(client, llm):
    found = suggestions(client.post(PATH, json=body(existing=["신분증"])))
    assert "신분증" not in found


def test_T07_4_labels_containing_each_other_are_the_same(client, llm):
    llm.mock(
        return_value=llm_response(
            {
                "items": [
                    {"label": "멀미약", "reason": "배를 타요"},
                    {"label": "지도", "reason": "길 찾기"},
                ]
            }
        )
    )
    request = body(existing=["멀미약 2개", "접이식 우산"], forecasts=[weather(rain=0.8)])
    found = suggestions(client.post(PATH, json=request))
    assert "멀미약" not in found
    assert "우산" not in found
    assert "지도" in found


def test_T07_5_deleted_item_is_not_suggested_again(client, llm):
    llm.mock(return_value=llm_response({"items": [{"label": "손수건", "reason": "더워요"}]}))
    found = suggestions(client.post(PATH, json=body(deleted=["손수건", "충전기"])))
    assert "손수건" not in found
    assert "충전기" not in found


def test_label_with_only_symbols_does_not_hide_everything(client, llm):
    found = suggestions(client.post(PATH, json=body(existing=["!!!"], deleted=["  "])))
    assert set(found) == set(ALWAYS)


def test_T07_6_llm_failure_still_returns_rule_results(client, llm):
    llm.mock(return_value=httpx.Response(500))
    assert set(suggestions(client.post(PATH, json=body()))) == set(ALWAYS)
    assert llm.called


@pytest.mark.parametrize("reply", ["not json", {"items": "wrong"}, {"nothing": 1}, ["list"]])
def test_malformed_llm_reply_falls_back_to_rules(client, llm, reply):
    llm.mock(return_value=llm_response(reply))
    assert set(suggestions(client.post(PATH, json=body()))) == set(ALWAYS)


def test_llm_adds_at_most_two_items_after_rules(client, llm):
    llm.mock(
        return_value=llm_response(
            {
                "items": [
                    {"label": "신분증", "reason": "규칙과 겹침"},
                    {"label": "멀미약", "reason": "배를 타요"},
                    {"label": "돗자리", "reason": "공원 일정"},
                    {"label": "셋째", "reason": "버림"},
                ]
            }
        )
    )
    response = client.post(PATH, json=body())
    assert list(suggestions(response)) == [*ALWAYS, "멀미약", "돗자리"]


@pytest.mark.parametrize(
    "entry",
    [
        "문자열",
        {"label": "이유없음"},
        {"label": "이유빈칸", "reason": "   "},
        {"label": "", "reason": "이름없음"},
        {"label": "!!!", "reason": "기호뿐"},
        {"label": 3, "reason": "숫자"},
        {"label": "이유숫자", "reason": 3},
        {"label": "가" * 31, "reason": "너무 긴 이름"},
        {"label": "긴이유", "reason": "가" * 101},
    ],
)
def test_invalid_llm_entries_are_dropped(client, llm, entry):
    llm.mock(return_value=llm_response({"items": [entry]}))
    assert set(suggestions(client.post(PATH, json=body()))) == set(ALWAYS)


def test_llm_receives_trip_context_but_no_personal_data(client, llm):
    request = body(items=[item("감천문화마을")], existing=["멀미약 2개"], deleted=["비밀 메모"])
    assert suggestions(client.post(PATH, json=request))

    sent = json.dumps(json.loads(llm.calls[0].request.content), ensure_ascii=False)
    assert "감천문화마을" in sent
    assert "멀미약" not in sent and "비밀 메모" not in sent
    assert "부산 어딘가" not in sent and JOB_ID not in sent


def test_requires_internal_token(client, llm):
    del client.headers["X-Internal-Token"]
    assert client.post(PATH, json=body()).status_code == 401


@pytest.mark.parametrize(
    "change",
    [
        {"jobId": None},
        {"trip": {"startDate": "내일", "endDate": None}},
        {"weather": [{**weather(), "precipitationProbability": 70}]},
    ],
    ids=["no-job-id", "bad-date", "probability-not-0-to-1"],
)
def test_invalid_request_is_400(client, llm, change):
    response = client.post(PATH, json={**body(), **change})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_rain_exactly_at_threshold_counts(client, llm):
    found = suggestions(client.post(PATH, json=body(forecasts=[weather(rain=0.6)])))
    assert found["우산"] == "비 60%"


def test_temperature_reasons_use_the_most_extreme_day(client, llm):
    forecasts = [weather("2026-11-14", low=4, high=20), weather("2026-11-15", low=-2, high=30)]
    found = suggestions(client.post(PATH, json=body(end="2026-11-15", forecasts=forecasts)))
    assert found["손난로"] == "최저 -2°"
    assert found["선크림"] == "최고 30°"


def test_llm_repeating_itself_is_kept_once(client, llm):
    reply = {
        "items": [{"label": "돗자리", "reason": "첫째"}, {"label": "돗 자리", "reason": "둘째"}]
    }
    llm.mock(return_value=llm_response(reply))
    found = suggestions(client.post(PATH, json=body()))
    assert found["돗자리"] == "첫째"
    assert "돗 자리" not in found


def test_symbol_only_llm_label_is_dropped_even_when_nothing_else_is_known(client, llm):
    llm.mock(return_value=llm_response({"items": [{"label": "!!!", "reason": "기호뿐"}]}))
    assert suggestions(client.post(PATH, json=body(deleted=ALWAYS))) == {}


def test_end_date_before_start_date_is_not_overnight(client, llm):
    found = suggestions(client.post(PATH, json=body(start="2026-11-15", end="2026-11-14")))
    assert set(found) == set(ALWAYS)


def test_llm_receives_at_most_fifty_places(client, llm):
    items = [item(f"장소{i}", order=i + 1) for i in range(51)]
    suggestions(client.post(PATH, json=body(items=items)))
    sent = json.dumps(json.loads(llm.calls[0].request.content), ensure_ascii=False)
    assert "장소49" in sent
    assert "장소50" not in sent
