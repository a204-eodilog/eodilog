"""날씨 대안 (spec §6, T-06-1 ~ T-06-7). 카카오 길찾기 HTTP 응답만 respx로 고정한다."""

from datetime import UTC, datetime, timedelta, timezone

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

PATH = "/ai/v1/weather-alternatives"
TOKEN = "secret-token"
WALK_URL = "https://dapi.kakao.com/v2/routing/walk"
TRANSIT_URL = "https://dapi.kakao.com/v2/routing/publictraffic"
CAR_URL = "https://apis-navi.kakaomobility.com/v1/directions"
DATE = "2026-11-14"
TARGET_ID = "beach"
TARGET_ITEM_ID = "item-beach"
OUTDOOR = "여행,명소>해수욕장,해변"
INDOOR = "문화,예술>박물관"
# 대상(해운대 해변) 좌표. 후보는 위도만 바꿔 거리를 정한다 (위도 0.001도 ≈ 111m)
BASE_LAT, BASE_LNG = 35.1587, 129.1604
KST = timezone(timedelta(hours=9))


@pytest.fixture
def client() -> TestClient:
    settings = Settings(_env_file=None, internal_api_token=TOKEN, kakao_rest_api_key="kakao-key")
    test_client = TestClient(create_app(settings), raise_server_exceptions=False)
    test_client.headers["X-Internal-Token"] = TOKEN
    return test_client


def walk_ok(seconds: int) -> httpx.Response:
    return httpx.Response(
        200, json={"status": "OK", "route": {"properties": {"totalTime": seconds}}}
    )


def transit_ok(seconds: int) -> httpx.Response:
    return httpx.Response(
        200, json={"status": "OK", "routes": [{"properties": {"totalTime": seconds}}]}
    )


@pytest.fixture
def routes():
    """기본은 모든 길찾기가 도보 8분·대중교통 20분. 필요한 테스트만 응답을 바꾼다."""
    with respx.mock(assert_all_called=False) as router:
        router.get(WALK_URL).mock(return_value=walk_ok(480))
        router.get(TRANSIT_URL).mock(return_value=transit_ok(1200))
        router.get(CAR_URL).mock(return_value=httpx.Response(500))
        yield router


def place(place_id: str, name: str, category: str | None, lat_offset: float = 0.0) -> dict:
    return {
        "id": place_id,
        "name": name,
        "address": "부산 해운대구 어딘가 1",
        "latitude": BASE_LAT + lat_offset,
        "longitude": BASE_LNG,
        "regionId": None,
        "provider": "NAVER",
        "providerPlaceId": None,
        "source": "PROVIDER",
        "category": category,
    }


def item(
    item_id: str, the_place: dict, order: int, start: str | None, stay: int | None = 120
) -> dict:
    return {
        "id": item_id,
        "place": the_place,
        "day": 1,
        "order": order,
        "startTime": start,
        "stayMinutes": stay,
    }


def target_item(start: str | None = "10:00", category: str | None = OUTDOOR, stay=120) -> dict:
    return item(TARGET_ITEM_ID, place(TARGET_ID, "해운대 해변", category), 1, start, stay)


def hourly(rain_kst_hours: dict[int, float], dry: float = 0.1) -> list[dict]:
    """08~22시(한국 시각) 시간별 예보. 지정한 시각만 그 확률, 나머지는 dry."""
    hours = []
    for kst_hour in range(8, 23):
        at = datetime(2026, 11, 14, kst_hour, tzinfo=KST).astimezone(UTC)
        probability = rain_kst_hours.get(kst_hour, dry)
        hours.append(
            {
                "at": at.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "condition": "RAIN" if probability >= 0.6 else "CLOUDY",
                "temperatureCelsius": 12,
                "precipitationProbability": probability,
            }
        )
    return hours


# 10~11시 비, 12시부터 그침
MORNING_RAIN = {10: 0.7, 11: 0.8}


def weather(rain_kst_hours: dict[int, float] | None = None) -> dict:
    return {
        "placeId": TARGET_ID,
        "date": DATE,
        "queriedAt": "2026-11-13T00:00:00Z",
        "forecastAt": "2026-11-13T00:00:00Z",
        "source": "KMA",
        "condition": "RAIN",
        "temperatureCelsius": 12,
        "minCelsius": 9,
        "maxCelsius": 14,
        "precipitationProbability": 0.7,
        "hourly": hourly(MORNING_RAIN if rain_kst_hours is None else rain_kst_hours),
        "stale": False,
    }


def candidate(
    place_id: str,
    name: str,
    lat_offset: float,
    category: str | None = INDOOR,
    status: str = "OPEN",
    checked_at: str | None = "2026-11-14T00:35:00Z",
) -> dict:
    return {
        "place": place(place_id, name, category, lat_offset),
        "openStatus": {"value": status, "checkedAt": checked_at},
    }


def body(**changes) -> dict:
    request = {
        "date": DATE,
        "placeId": TARGET_ID,
        "expectedVersion": 3,
        "weather": weather(),
        "dayItems": [target_item()],
        "alternativePool": [],
        "defaultTransportMode": "TRANSIT",
    }
    request.update(changes)
    return request


def alternatives(client: TestClient, request: dict) -> list[dict]:
    response = client.post(PATH, json=request)
    assert response.status_code == 200, response.text
    return response.json()["data"]["alternatives"]


def of_type(found: list[dict], kind: str) -> list[dict]:
    return [alternative for alternative in found if alternative["type"] == kind]


def test_T06_7_indoor_place_gets_no_alternatives(client, routes):
    request = body(
        dayItems=[target_item(category=INDOOR)],
        alternativePool=[candidate("museum", "부산 박물관", 0.002)],
    )

    assert alternatives(client, request) == []


def test_T06_7_dry_time_gets_no_alternatives(client, routes):
    request = body(
        weather=weather({15: 0.9}),
        alternativePool=[candidate("museum", "부산 박물관", 0.002)],
    )

    assert alternatives(client, request) == []


def test_response_echoes_weather_and_base_version(client, routes):
    request = body(weather=weather({}))

    response = client.post(PATH, json=request)

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["baseVersion"] == 3
    assert data["weather"] == request["weather"]


def lunch_at_noon(stay: int = 120) -> dict:
    return item("item-lunch", place("lunch", "점심 식당", "음식점>한식"), 2, "12:00", stay)


def test_T06_1_outdoor_rain_shifts_to_first_free_time_after_rain(client, routes):
    request = body(dayItems=[target_item("10:00"), lunch_at_noon()])

    shifts = of_type(alternatives(client, request), "TIME_SHIFT")

    assert len(shifts) == 1
    shift = shifts[0]
    assert shift["itemId"] == TARGET_ITEM_ID
    assert shift["targetStartTime"] == "14:00"
    assert shift["place"] is None
    assert shift["alternativeId"]
    assert shift["activity"] == "해운대 해변을 오후 2시로 옮기기"
    assert shift["reason"] == "비 그친 뒤 14:00 · 12시부터 그쳐요 (예보)"


def test_T06_2_no_free_time_after_rain_means_no_time_shift(client, routes):
    busy = [
        lunch_at_noon(),
        item("item-cafe", place("cafe", "오후 카페", "카페,디저트"), 3, "14:00", 240),
        item("item-dinner", place("dinner", "저녁 식당", "음식점>한식"), 4, "18:00", 180),
    ]
    request = body(
        dayItems=[target_item("10:00"), *busy],
        alternativePool=[candidate("museum", "부산 박물관", 0.002)],
    )

    found = alternatives(client, request)

    assert of_type(found, "TIME_SHIFT") == []
    assert [alt["place"]["id"] for alt in of_type(found, "PLACE_SWAP")] == ["museum"]


def test_time_shift_must_end_within_the_day(client, routes):
    # 18:00 이후는 비지만 머무는 4시간이 21:00을 넘는다
    request = body(
        dayItems=[target_item("10:00", stay=240), lunch_at_noon(360)],
    )

    assert of_type(alternatives(client, request), "TIME_SHIFT") == []


def test_time_shift_skips_later_rain_and_unknown_hours(client, routes):
    # 12시 그침, 13시 다시 비, 14시 확률 모름 → 두 시간이 모두 마른 첫 시각은 15:00
    rain = {**MORNING_RAIN, 13: 0.6}
    forecast = weather(rain)
    forecast["hourly"][14 - 8]["precipitationProbability"] = None
    request = body(weather=forecast, dayItems=[target_item("10:00", stay=120)])

    shifts = of_type(alternatives(client, request), "TIME_SHIFT")

    assert [shift["targetStartTime"] for shift in shifts] == ["15:00"]


def swap_ids(found: list[dict]) -> list[str]:
    return [alt["place"]["id"] for alt in of_type(found, "PLACE_SWAP")]


def test_T06_3_closed_excluded_and_nearest_first(client, routes):
    pool = [
        candidate("far", "먼 미술관", 0.030),
        candidate("closed", "닫은 박물관", 0.001, status="CLOSED"),
        candidate("near", "가까운 박물관", 0.002),
        candidate("unknown", "영업 모름 카페", 0.010, category="카페,디저트", status="UNKNOWN"),
    ]
    request = body(alternativePool=pool)

    assert swap_ids(alternatives(client, request)) == ["near", "unknown", "far"]


def test_place_swap_at_most_three_and_only_indoor(client, routes):
    pool = [
        candidate("park", "옆 공원", 0.001, category="여행,명소>공원"),
        candidate("no-category", "분류 없는 곳", 0.001, category=None),
        *(candidate(f"m{i}", f"박물관 {i}", 0.002 * (i + 1)) for i in range(4)),
    ]
    request = body(alternativePool=pool)

    assert swap_ids(alternatives(client, request)) == ["m0", "m1", "m2"]


def test_place_swap_fields_and_reason_with_travel_time(client, routes):
    pool = [candidate("near", "해운대 실내 수족관", 0.002, category="문화,예술>박물관")]
    request = body(dayItems=[target_item("10:00"), lunch_at_noon(600)], alternativePool=pool)

    [swap] = of_type(alternatives(client, request), "PLACE_SWAP")

    assert swap["itemId"] == TARGET_ITEM_ID
    assert swap["targetStartTime"] is None
    assert swap["place"] == pool[0]["place"]
    assert swap["activity"] == "해운대 실내 수족관"
    # 220m라 도보로 잰다. 영업 확인 시각은 한국 시각
    assert swap["reason"] == "도보 8분 · 영업 중(09:35 확인)"
    assert routes.routes[0].call_count == 1


def test_far_swap_uses_default_transport_mode(client, routes):
    pool = [candidate("far", "먼 박물관", 0.020, status="UNKNOWN")]
    request = body(alternativePool=pool, defaultTransportMode="TRANSIT")

    [swap] = of_type(alternatives(client, request), "PLACE_SWAP")

    assert swap["reason"] == "대중교통 20분 · 영업 정보 없음"


def test_T06_4_no_indoor_candidate_and_no_free_time_gives_info(client, routes):
    pool = [
        candidate("park", "옆 공원", 0.001, category="여행,명소>공원"),
        candidate("closed", "닫은 박물관", 0.002, status="CLOSED"),
    ]
    request = body(dayItems=[target_item("10:00"), lunch_at_noon(600)], alternativePool=pool)

    found = alternatives(client, request)

    assert len(found) == 1
    info = found[0]
    assert info["type"] == "INFO"
    assert info["alternativeId"]
    assert info["place"] is None
    assert info["itemId"] is None
    assert info["targetStartTime"] is None
    assert info["activity"] == "우산과 우비 챙기기"
    assert info["reason"] == "가까운 실내 대안이 없어요"


def test_time_shift_without_indoor_candidate_gives_no_info(client, routes):
    found = alternatives(client, body(alternativePool=[]))

    assert [alt["type"] for alt in found] == ["TIME_SHIFT"]


def test_T06_5_swaps_only_use_pool_places_not_already_in_the_course(client, routes):
    lunch = lunch_at_noon(600)
    pool = [
        {"place": lunch["place"], "openStatus": {"value": "OPEN", "checkedAt": None}},
        {"place": target_item()["place"], "openStatus": {"value": "OPEN", "checkedAt": None}},
        candidate("museum", "부산 박물관", 0.002),
        candidate("museum", "부산 박물관", 0.002),
    ]
    request = body(dayItems=[target_item("10:00"), lunch], alternativePool=pool)

    found = alternatives(client, request)

    pool_ids = {entry["place"]["id"] for entry in pool}
    assert all(alt["place"]["id"] in pool_ids for alt in of_type(found, "PLACE_SWAP"))
    assert swap_ids(found) == ["museum"]
    assert all(alt["place"] is None for alt in found if alt["type"] != "PLACE_SWAP")


@pytest.mark.parametrize(
    "failure", [httpx.Response(500), httpx.Response(200, json={"status": "NO_RESULTS"})]
)
def test_T06_6_route_failure_keeps_the_alternative(client, routes, failure):
    routes.get(WALK_URL).mock(return_value=failure)
    request = body(alternativePool=[candidate("near", "가까운 박물관", 0.002)])

    [swap] = of_type(alternatives(client, request), "PLACE_SWAP")

    assert swap["place"]["id"] == "near"
    assert swap["reason"] == "이동 시간 확인 못 함 · 영업 중(09:35 확인)"


def test_T06_6_unreachable_route_provider_keeps_the_alternative(client, routes):
    routes.get(WALK_URL).mock(side_effect=httpx.ConnectError("down"))
    request = body(alternativePool=[candidate("near", "가까운 박물관", 0.002)])

    assert swap_ids(alternatives(client, request)) == ["near"]


def test_requires_internal_token(client, routes):
    del client.headers["X-Internal-Token"]

    assert client.post(PATH, json=body()).status_code == 401


@pytest.mark.parametrize(
    "change",
    [
        {"placeId": None},
        {"expectedVersion": "three"},
        {"weather": None},
        {"dayItems": [target_item("10시")]},
        {"alternativePool": [{"place": place("x", "x", INDOOR), "openStatus": {"value": "?"}}]},
        {"defaultTransportMode": "BIKE"},
    ],
)
def test_invalid_request_is_400_with_trace_id(client, routes, change):
    response = client.post(PATH, json=body(**change), headers={"X-Trace-Id": "job-123"})

    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["traceId"] == "job-123"


def test_target_place_missing_from_day_items_is_422(client, routes):
    request = body(placeId="not-in-course")

    response = client.post(PATH, json=request, headers={"X-Trace-Id": "job-123"})

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "INSUFFICIENT_DATA"
    assert error["fields"][0]["field"] == "placeId"
    assert error["traceId"] == "job-123"


@pytest.mark.parametrize("category", [None, "기타>교통시설"])
def test_unknown_indoor_outdoor_gets_no_alternatives(client, routes, category):
    request = body(
        dayItems=[target_item(category=category)],
        alternativePool=[candidate("museum", "부산 박물관", 0.002)],
    )

    assert alternatives(client, request) == []


def test_target_without_start_time_gets_no_alternatives(client, routes):
    request = body(
        dayItems=[target_item(start=None)],
        alternativePool=[candidate("museum", "부산 박물관", 0.002)],
    )

    assert alternatives(client, request) == []


def test_rain_during_the_stay_counts_even_if_start_is_dry(client, routes):
    # 9시 시작·3시간 머묾. 9시는 맑고 10~11시 비
    request = body(dayItems=[target_item("09:00", stay=180)])

    assert [alt["type"] for alt in alternatives(client, request)] == ["TIME_SHIFT"]


def test_rain_exactly_at_threshold_counts(client, routes):
    request = body(weather=weather({10: 0.6}))

    assert [alt["type"] for alt in alternatives(client, request)] == ["TIME_SHIFT"]


@pytest.mark.parametrize(
    ("category", "outdoor"),
    [
        ("여행,명소>해수욕장,해변", True),
        ("여행 > 관광,명소", True),
        ("여행,명소>공원", True),
        ("산", True),
        ("카페,디저트", False),
        ("음식점>한식", False),
        ("문화,예술>박물관", False),
        ("쇼핑,유통>백화점", False),
        ("숙박>호텔", False),
        ("부산 맛집", None),
        (None, None),
    ],
)
def test_indoor_outdoor_from_category(category, outdoor):
    from app.features.weather_alternatives.service import is_outdoor

    assert is_outdoor(category) is outdoor


@pytest.mark.parametrize(
    ("category", "outdoor"),
    [
        ("여행,명소>아쿠아리움", False),
        ("여행 > 관광,명소 > 아쿠아리움", False),
        ("문화,예술>미술관", False),
        ("문화,예술>박물관", False),
        ("여행,명소>해수욕장", True),
        ("여행,명소", True),
        ("여행,명소>문화마을", True),
        ("여행,명소>계곡", True),
        ("여행,명소>폭포", True),
        ("여행,명소>둘레길", True),
    ],
)
def test_indoor_facility_beats_generic_attraction(category, outdoor):
    from app.features.weather_alternatives.service import is_outdoor

    assert is_outdoor(category) is outdoor


def test_aquarium_under_attraction_category_becomes_place_swap(client, routes):
    pool = [candidate("aquarium", "해운대 실내 수족관", 0.002, category="여행,명소>아쿠아리움")]
    request = body(alternativePool=pool)

    assert swap_ids(alternatives(client, request)) == ["aquarium"]
