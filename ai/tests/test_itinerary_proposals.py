"""코스 변경안 (spec §5, T-04-1 ~ T-04-10). 카카오 길찾기 HTTP 응답만 respx로 고정한다."""

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

PATH = "/ai/v1/itinerary-proposals"
TOKEN = "secret-token"
WALK_URL = "https://dapi.kakao.com/v2/routing/walk"
TRANSIT_URL = "https://dapi.kakao.com/v2/routing/publictraffic"
CAR_URL = "https://apis-navi.kakaomobility.com/v1/directions"
SIGHT = "여행,명소>해수욕장,해변"
CAFE = "카페,디저트>카페"
FOOD = "한식>국밥"
MUSEUM = "문화,예술>박물관"
BUSAN_LAT, BUSAN_LNG = 35.15, 129.1
TEN_MINUTES = 600


def transit_ok(seconds: int = TEN_MINUTES) -> httpx.Response:
    return httpx.Response(
        200, json={"status": "OK", "routes": [{"properties": {"totalTime": seconds}}]}
    )


def walk_ok(seconds: int = TEN_MINUTES) -> httpx.Response:
    return httpx.Response(
        200, json={"status": "OK", "route": {"properties": {"totalTime": seconds}}}
    )


@pytest.fixture
def client() -> TestClient:
    settings = Settings(_env_file=None, internal_api_token=TOKEN, kakao_rest_api_key="kakao-key")
    test_client = TestClient(create_app(settings), raise_server_exceptions=False)
    test_client.headers["X-Internal-Token"] = TOKEN
    return test_client


@pytest.fixture
def routes():
    """기본은 모든 구간이 대중교통 10분. 필요한 테스트만 응답을 바꾼다."""
    with respx.mock(assert_all_called=False) as router:
        router.get(TRANSIT_URL).mock(return_value=transit_ok())
        router.get(WALK_URL).mock(return_value=walk_ok())
        router.get(CAR_URL).mock(return_value=httpx.Response(500))
        yield router


def place(
    place_id: str,
    category: str | None = SIGHT,
    lat: float = BUSAN_LAT,
    lng: float = BUSAN_LNG,
    region_id: str | None = None,
) -> dict:
    return {
        "id": place_id,
        "name": f"장소 {place_id}",
        "address": "부산 어딘가 1",
        "latitude": lat,
        "longitude": lng,
        "regionId": region_id,
        "provider": "NAVER",
        "providerPlaceId": None,
        "source": "PROVIDER",
        "category": category,
    }


def trip(start: str | None = "2026-11-14", end: str | None = "2026-11-14", regions=()) -> dict:
    return {
        "id": "trip",
        "startDate": start,
        "endDate": end,
        "destinationRegionIds": list(regions),
    }


def initial(places: list[dict], the_trip: dict | None = None, **extra) -> dict:
    return {
        "reason": "INITIAL",
        "expectedVersion": 3,
        "trip": the_trip or trip(),
        "places": places,
        "current": {"items": [], "legs": []},
        "defaultTransportMode": "TRANSIT",
        "excludedPlaceIds": [],
        "selectedAlternative": None,
        **extra,
    }


def item(item_id: str, the_place: dict, order: int, start: str | None, stay=60, day=1) -> dict:
    return {
        "id": item_id,
        "place": the_place,
        "day": day,
        "order": order,
        "startTime": start,
        "stayMinutes": stay,
    }


def leg(from_id: str, to_id: str, day: int, from_order: int, seconds: int = 111) -> dict:
    return {
        "fromItemId": from_id,
        "toItemId": to_id,
        "day": day,
        "fromOrder": from_order,
        "toOrder": from_order + 1,
        "transportMode": "WALK",
        "durationSeconds": seconds,
        "distanceMeters": 500,
        "geometry": None,
        "status": "AVAILABLE",
        "queriedAt": "2026-11-13T00:00:00Z",
    }


def existing(reason: str, items: list[dict], legs: list[dict] | None = None, **extra) -> dict:
    return {
        "reason": reason,
        "expectedVersion": 7,
        "trip": trip(),
        "places": [],
        "current": {"items": items, "legs": legs or []},
        "defaultTransportMode": "TRANSIT",
        "excludedPlaceIds": [],
        "selectedAlternative": None,
        **extra,
    }


def alternative(kind: str, item_id: str | None, **extra) -> dict:
    return {
        "alternativeId": "alt",
        "type": kind,
        "place": None,
        "itemId": item_id,
        "targetStartTime": None,
        "activity": "활동",
        "reason": "이유",
        **extra,
    }


def post_ok(client: TestClient, body: dict) -> dict:
    response = client.post(PATH, json=body)
    assert response.status_code == 200, response.text
    return response.json()["data"]


def error_of(client: TestClient, body: dict, status: int = 422) -> dict:
    response = client.post(PATH, json=body)
    assert response.status_code == status, response.text
    return response.json()["error"]


def field_names(error: dict) -> set[str]:
    return {field["field"] for field in error["fields"]}


def day_items(data: dict, day: int = 1) -> list[dict]:
    items = [i for i in data["proposed"]["items"] if i["day"] == day]
    return sorted(items, key=lambda i: i["order"])


def by_day(data: dict) -> dict[int, list[str]]:
    days = {i["day"] for i in data["proposed"]["items"]}
    return {day: [i["place"]["id"] for i in day_items(data, day)] for day in days}


def proposed_item(data: dict, place_id: str) -> dict:
    return next(i for i in data["proposed"]["items"] if i["place"]["id"] == place_id)


def legs_of(data: dict, day: int = 1) -> list[dict]:
    legs = [g for g in data["proposed"]["legs"] if g["day"] == day]
    return sorted(legs, key=lambda g: g["fromOrder"])


# --- T-04-1 날짜 배분


def test_t04_1_five_places_over_two_days_each_once(client, routes):
    places = [place(f"p{n}", lat=BUSAN_LAT + n * 0.001) for n in range(5)]
    data = post_ok(client, initial(places, trip("2026-11-14", "2026-11-15")))

    days = by_day(data)
    assert set(days) == {1, 2}
    assert sorted(len(ids) for ids in days.values()) == [2, 3]
    assert sorted(i for ids in days.values() for i in ids) == [f"p{n}" for n in range(5)]
    assert all(i["id"] is None for i in data["proposed"]["items"])
    for day, ids in days.items():
        assert [i["order"] for i in day_items(data, day)] == list(range(1, len(ids) + 1))
    assert data["baseVersion"] == 3
    assert data["reason"] == "INITIAL"
    assert data["appliedAt"] is None
    assert data["canUndo"] is False
    assert sorted(data["diff"]["addedPlaceIds"]) == [f"p{n}" for n in range(5)]
    assert data["diff"]["removedPlaceIds"] == []
    assert "1일차" in data["diff"]["description"]
    assert "2일차" in data["diff"]["description"]


def test_initial_groups_nearby_places_on_the_same_day(client, routes):
    busan = [place(f"b{n}", lat=35.15 + n * 0.001, lng=129.1) for n in range(2)]
    jeju = [place(f"j{n}", lat=33.45 + n * 0.001, lng=126.5) for n in range(2)]
    data = post_ok(client, initial([busan[0], jeju[0], busan[1], jeju[1]], trip(end="2026-11-15")))

    assert sorted(sorted(ids) for ids in by_day(data).values()) == [["b0", "b1"], ["j0", "j1"]]


def test_initial_splits_days_by_destination_region(client, routes):
    """지역이 서로 가까워도 여행지별로 날짜를 나눈다 (Q-6)."""
    places = [
        place("a0", lat=35.1500, region_id="A"),
        place("b0", lat=35.1501, region_id="B"),
        place("a1", lat=35.1502, region_id="A"),
        place("b1", lat=35.1503, region_id="B"),
    ]
    data = post_ok(client, initial(places, trip(end="2026-11-15", regions=["A", "B"])))

    assert sorted(by_day(data)[1]) == ["a0", "a1"]
    assert sorted(by_day(data)[2]) == ["b0", "b1"]


def test_more_regions_than_days_still_uses_only_trip_days(client, routes):
    places = [place("a", region_id="A"), place("b", region_id="B")]
    data = post_ok(client, initial(places, trip(regions=["A", "B"])))

    assert set(by_day(data)) == {1}
    assert sorted(by_day(data)[1]) == ["a", "b"]


def test_initial_lists_a_duplicate_place_once(client, routes):
    data = post_ok(client, initial([place("p1"), place("p1"), place("p2")]))

    assert sorted(by_day(data)[1]) == ["p1", "p2"]


def test_initial_skips_excluded_places(client, routes):
    data = post_ok(client, initial([place("p1"), place("p2")], excludedPlaceIds=["p2"]))

    assert by_day(data)[1] == ["p1"]


def test_initial_uses_stay_minutes_by_category_from_ten(client, routes):
    places = [place("cafe", CAFE), place("other", "생활,편의>세탁소")]
    data = post_ok(client, initial(places))

    assert day_items(data)[0]["startTime"] == "10:00"
    assert proposed_item(data, "cafe")["stayMinutes"] == 60
    assert proposed_item(data, "other")["stayMinutes"] == 90


@pytest.mark.parametrize("category", [SIGHT, MUSEUM], ids=["outdoor", "museum"])
def test_initial_uses_two_hours_for_sights(client, routes, category):
    data = post_ok(client, initial([place("sight", category)]))

    assert proposed_item(data, "sight")["stayMinutes"] == 120


def test_next_start_is_after_stay_and_provider_travel_time(client, routes):
    data = post_ok(client, initial([place("a", CAFE), place("b", CAFE)]))

    assert [i["startTime"] for i in day_items(data)] == ["10:00", "11:10"]
    the_leg = legs_of(data)[0]
    assert the_leg["durationSeconds"] == TEN_MINUTES
    assert the_leg["transportMode"] == "TRANSIT"
    assert the_leg["status"] == "AVAILABLE"
    assert (the_leg["fromOrder"], the_leg["toOrder"]) == (1, 2)
    assert the_leg["fromItemId"] is None
    assert the_leg["toItemId"] is None
    assert the_leg["distanceMeters"] is None
    assert the_leg["geometry"] is None
    assert the_leg["queriedAt"]


def test_places_past_day_end_are_reported_as_not_placed(client, routes):
    routes.get(TRANSIT_URL).mock(return_value=transit_ok(3600 * 3))
    places = [place(f"p{n}", SIGHT, lat=BUSAN_LAT + n * 0.001) for n in range(3)]
    data = post_ok(client, initial(places))

    assert len(by_day(data)[1]) == 2
    assert "1곳은 넣지 못했어요" in data["diff"]["description"]
    assert len(legs_of(data)) == 1
    assert len(data["diff"]["addedPlaceIds"]) == 2


def test_initial_keeps_the_id_of_a_place_already_in_the_course(client, routes):
    body = initial([place("p1"), place("p2")])
    body["current"]["items"] = [
        item("old", place("p1"), 1, "10:00"),
        item("gone", place("x"), 2, None),
    ]
    data = post_ok(client, body)

    assert proposed_item(data, "p1")["id"] == "old"
    assert proposed_item(data, "p2")["id"] is None
    assert data["diff"]["addedPlaceIds"] == ["p2"]
    assert data["diff"]["removedPlaceIds"] == ["x"]


# --- T-04-2 선행 조건


@pytest.mark.parametrize(
    ("start", "end", "field"),
    [(None, "2026-11-15", "trip.startDate"), ("2026-11-14", None, "trip.endDate")],
)
def test_t04_2_missing_period_is_422(client, routes, start, end, field):
    error = error_of(client, initial([place("p1")], trip(start, end)))

    assert error["code"] == "INSUFFICIENT_DATA"
    assert field in field_names(error)


def test_no_places_is_422(client, routes):
    error = error_of(client, initial([]))

    assert error["code"] == "INSUFFICIENT_DATA"
    assert "places" in field_names(error)


def test_all_places_excluded_is_422(client, routes):
    error = error_of(client, initial([place("p1")], excludedPlaceIds=["p1"]))

    assert "places" in field_names(error)


def test_end_before_start_is_400(client, routes):
    error = error_of(client, initial([place("p1")], trip("2026-11-15", "2026-11-14")), 400)

    assert error["code"] == "VALIDATION_ERROR"


# --- T-04-3 구간 실패


def test_t04_3_failed_leg_is_null_unavailable_with_thirty_minute_buffer(client, routes):
    routes.get(TRANSIT_URL).mock(return_value=httpx.Response(500))
    data = post_ok(client, initial([place("a", CAFE), place("b", CAFE)]))

    the_leg = legs_of(data)[0]
    assert the_leg["durationSeconds"] is None
    assert the_leg["status"] == "UNAVAILABLE"
    assert [i["startTime"] for i in day_items(data)] == ["10:00", "11:30"]


# --- T-04-4 하루 최대 5곳


def test_t04_4_eight_places_in_one_day_keeps_five(client, routes):
    routes.get(TRANSIT_URL).mock(return_value=transit_ok(60))
    places = [place(f"p{n}", CAFE, lat=BUSAN_LAT + n * 0.001) for n in range(8)]
    data = post_ok(client, initial(places))

    assert len(by_day(data)[1]) == 5
    assert "3곳은 넣지 못했어요" in data["diff"]["description"]
    assert len(data["diff"]["addedPlaceIds"]) == 5


# --- T-04-5 식사 시간


def test_t04_5_restaurant_goes_at_lunch(client, routes):
    data = post_ok(client, initial([place("food", FOOD), place("cafe", CAFE)]))

    assert proposed_item(data, "cafe")["startTime"] == "10:00"
    assert proposed_item(data, "food")["startTime"] == "12:00"
    assert proposed_item(data, "food")["stayMinutes"] == 90


def test_only_restaurant_starts_at_noon(client, routes):
    data = post_ok(client, initial([place("food", FOOD)]))

    assert proposed_item(data, "food")["startTime"] == "12:00"


def test_second_restaurant_goes_at_dinner(client, routes):
    places = [place("f1", FOOD), place("f2", FOOD), place("s1", SIGHT), place("c1", CAFE)]
    data = post_ok(client, initial(places))

    times = sorted(proposed_item(data, name)["startTime"] for name in ("f1", "f2"))
    assert times == ["12:00", "18:00"]


# --- T-04-6 근거리 도보 대체


def test_t04_6_near_places_without_transit_route_walk(client, routes):
    routes.get(TRANSIT_URL).mock(return_value=httpx.Response(200, json={"status": "NOT_FOUND"}))
    data = post_ok(client, initial([place("a", CAFE), place("b", CAFE, lat=BUSAN_LAT + 0.001)]))

    the_leg = legs_of(data)[0]
    assert the_leg["transportMode"] == "WALK"
    assert the_leg["durationSeconds"] == TEN_MINUTES
    assert the_leg["status"] == "AVAILABLE"


# --- T-04-7 장소 제외


def removal_body() -> dict:
    items = [
        item("i1", place("a", CAFE), 1, "10:00"),
        item("i2", place("b", CAFE), 2, "11:30"),
        item("i3", place("c", CAFE), 3, "13:00"),
        item("i9", place("z", CAFE), 1, "10:00", day=2),
        item("i8", place("y", CAFE), 2, "12:00", day=2),
    ]
    legs = [leg("i1", "i2", 1, 1), leg("i2", "i3", 1, 2), leg("i9", "i8", 2, 1, seconds=999)]
    return existing("PLACE_REMOVED", items, legs, excludedPlaceIds=["b"])


def test_t04_7_removed_place_is_gone_and_order_kept(client, routes):
    data = post_ok(client, removal_body())

    assert by_day(data)[1] == ["a", "c"]
    assert [i["order"] for i in day_items(data)] == [1, 2]
    assert proposed_item(data, "c")["id"] == "i3"
    assert data["diff"]["removedPlaceIds"] == ["b"]
    assert data["diff"]["addedPlaceIds"] == []
    assert data["baseVersion"] == 7
    assert data["reason"] == "PLACE_REMOVED"


def test_removal_recalculates_times_and_legs_of_that_day(client, routes):
    data = post_ok(client, removal_body())

    assert proposed_item(data, "a")["startTime"] == "10:00"
    assert proposed_item(data, "c")["startTime"] == "11:10"
    day_one = legs_of(data)
    assert len(day_one) == 1
    assert (day_one[0]["fromItemId"], day_one[0]["toItemId"]) == ("i1", "i3")
    assert (day_one[0]["fromOrder"], day_one[0]["toOrder"]) == (1, 2)
    assert day_one[0]["durationSeconds"] == TEN_MINUTES


def test_removal_leaves_other_days_untouched(client, routes):
    data = post_ok(client, removal_body())

    assert proposed_item(data, "y")["startTime"] == "12:00"
    day_two = legs_of(data, 2)
    assert len(day_two) == 1
    assert day_two[0]["durationSeconds"] == 999
    assert routes.calls.call_count == 1


def test_removal_copies_other_day_legs_sent_without_day_fields(client, routes):
    """백엔드 RouteLeg에는 day·순서가 없다."""
    body = removal_body()
    for sent in body["current"]["legs"]:
        for name in ("day", "fromOrder", "toOrder"):
            del sent[name]
    data = post_ok(client, body)

    day_two = legs_of(data, 2)[0]
    assert (day_two["fromItemId"], day_two["fromOrder"], day_two["toOrder"]) == ("i9", 1, 2)


def test_removal_keeps_a_dinner_at_dinner(client, routes):
    items = [
        item("i1", place("a", CAFE), 1, "10:00"),
        item("i2", place("b", CAFE), 2, "11:30"),
        item("i3", place("f", FOOD), 3, "18:00", stay=90),
    ]
    data = post_ok(client, existing("PLACE_REMOVED", items, excludedPlaceIds=["b"]))

    assert proposed_item(data, "f")["startTime"] == "18:00"


def test_removing_the_first_place_starts_from_the_next_one(client, routes):
    items = [
        item("i1", place("a", CAFE), 1, "10:00"),
        item("i2", place("b", CAFE), 2, "13:00"),
    ]
    data = post_ok(client, existing("PLACE_REMOVED", items, excludedPlaceIds=["a"]))

    assert proposed_item(data, "b")["order"] == 1
    assert proposed_item(data, "b")["startTime"] == "13:00"
    assert data["proposed"]["legs"] == []


@pytest.mark.parametrize(
    ("current_items", "excluded", "field"),
    [([], ["a"], "current"), ([item("i1", place("a"), 1, "10:00")], [], "excludedPlaceIds")],
    ids=["no-current", "no-excluded"],
)
def test_removal_requires_current_and_excluded(client, routes, current_items, excluded, field):
    error = error_of(client, existing("PLACE_REMOVED", current_items, excludedPlaceIds=excluded))

    assert error["code"] == "INSUFFICIENT_DATA"
    assert field in field_names(error)


# --- T-04-8 날씨 대안


def weather_items() -> list[dict]:
    return [
        item("i1", place("beach", SIGHT), 1, "10:00", stay=120),
        item("i2", place("cafe", CAFE), 2, "12:30", stay=60),
        item("i3", place("park", SIGHT), 3, "16:00", stay=60),
    ]


def weather_body(selected: dict | None, items: list[dict] | None = None) -> dict:
    legs = [leg("i1", "i2", 1, 1), leg("i2", "i3", 1, 2)]
    return existing(
        "WEATHER", weather_items() if items is None else items, legs, selectedAlternative=selected
    )


def test_t04_8_time_shift_moves_the_same_place(client, routes):
    data = post_ok(client, weather_body(alternative("TIME_SHIFT", "i2", targetStartTime="14:00")))

    moved = proposed_item(data, "cafe")
    assert moved["id"] == "i2"
    assert moved["startTime"] == "14:00"
    assert proposed_item(data, "beach")["startTime"] == "10:00"
    assert data["diff"]["removedPlaceIds"] == []
    assert data["diff"]["addedPlaceIds"] == []
    assert data["reason"] == "WEATHER"


def test_time_shift_reorders_the_day_by_time(client, routes):
    data = post_ok(client, weather_body(alternative("TIME_SHIFT", "i1", targetStartTime="18:00")))

    assert by_day(data)[1] == ["cafe", "park", "beach"]
    assert [(g["fromItemId"], g["toItemId"]) for g in legs_of(data)] == [("i2", "i3"), ("i3", "i1")]


def test_t04_8_place_swap_replaces_the_place(client, routes):
    museum = place("museum", MUSEUM, lat=BUSAN_LAT + 0.01)
    data = post_ok(client, weather_body(alternative("PLACE_SWAP", "i1", place=museum)))

    assert by_day(data)[1] == ["museum", "cafe", "park"]
    swapped = proposed_item(data, "museum")
    assert swapped["id"] is None
    assert swapped["startTime"] == "10:00"
    assert swapped["order"] == 1
    assert data["diff"]["removedPlaceIds"] == ["beach"]
    assert data["diff"]["addedPlaceIds"] == ["museum"]
    first_leg = legs_of(data)[0]
    assert first_leg["fromItemId"] is None
    assert first_leg["toItemId"] == "i2"
    assert first_leg["durationSeconds"] == TEN_MINUTES


def test_place_swap_does_not_pull_later_items_earlier(client, routes):
    data = post_ok(client, weather_body(alternative("PLACE_SWAP", "i2", place=place("m", MUSEUM))))

    assert proposed_item(data, "beach")["startTime"] == "10:00"
    assert proposed_item(data, "m")["startTime"] == "12:30"
    assert proposed_item(data, "park")["startTime"] == "16:00"


def test_place_swap_pushes_a_later_item_that_would_overlap(client, routes):
    items = [
        item("i1", place("beach", SIGHT), 1, "10:00", stay=60),
        item("i2", place("cafe", CAFE), 2, "11:10", stay=60),
    ]
    selected = alternative("PLACE_SWAP", "i1", place=place("m", MUSEUM))
    data = post_ok(client, weather_body(selected, items))

    assert proposed_item(data, "m")["stayMinutes"] == 120
    assert proposed_item(data, "cafe")["startTime"] == "12:10"


@pytest.mark.parametrize(
    "selected",
    [
        None,
        alternative("TIME_SHIFT", "nope", targetStartTime="14:00"),
        alternative("TIME_SHIFT", "i1"),
        alternative("PLACE_SWAP", "i1"),
    ],
    ids=["no-alternative", "unknown-item", "shift-no-time", "swap-no-place"],
)
def test_weather_with_unusable_alternative_is_insufficient(client, routes, selected):
    assert error_of(client, weather_body(selected))["code"] == "INSUFFICIENT_DATA"


def test_weather_requires_current(client, routes):
    selected = alternative("TIME_SHIFT", "i1", targetStartTime="14:00")
    error = error_of(client, weather_body(selected, []))

    assert "current" in field_names(error)


# --- T-04-9 INFO


def test_t04_9_info_alternative_is_422(client, routes):
    error = error_of(client, weather_body(alternative("INFO", None)))

    assert error["code"] == "UNSCHEDULABLE_ALTERNATIVE"


# --- T-04-10 입력 밖 장소 없음


def test_t04_10_proposal_only_contains_requested_places(client, routes):
    places = [place(f"p{n}", SIGHT, lat=BUSAN_LAT + n * 0.002) for n in range(7)]
    data = post_ok(client, initial(places, trip(end="2026-11-16")))

    requested = {p["id"]: p for p in places}
    assert data["proposed"]["items"]
    for proposed in data["proposed"]["items"]:
        assert proposed["place"] == requested[proposed["place"]["id"]]


# --- 공통


def test_requires_internal_token(routes):
    settings = Settings(_env_file=None, internal_api_token=TOKEN, kakao_rest_api_key="kakao-key")
    test_client = TestClient(create_app(settings), raise_server_exceptions=False)

    assert test_client.post(PATH, json=initial([place("p1")])).status_code == 401
