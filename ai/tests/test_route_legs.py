"""구간 이동 시간 재계산 (spec §5.1, T-04-11 ~ T-04-16). 카카오 HTTP 응답만 respx로 고정한다."""

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

PATH = "/ai/v1/route-legs"
TOKEN = "secret-token"
WALK_URL = "https://dapi.kakao.com/v2/routing/walk"
TRANSIT_URL = "https://dapi.kakao.com/v2/routing/publictraffic"
CAR_URL = "https://apis-navi.kakaomobility.com/v1/directions"
HAEUNDAE = {"latitude": 35.1587, "longitude": 129.1604}
JAGALCHI = {"latitude": 35.0966, "longitude": 129.0306}
NEARBY = {"latitude": 35.1637, "longitude": 129.1604}  # 해운대에서 약 550m


def car_ok(seconds: int) -> httpx.Response:
    body = {"routes": [{"result_code": 0, "summary": {"duration": seconds, "distance": 8000}}]}
    return httpx.Response(200, json=body)


def walk_ok(seconds: int) -> httpx.Response:
    return httpx.Response(
        200, json={"status": "OK", "route": {"properties": {"totalTime": seconds}}}
    )


def transit_ok(seconds: int) -> httpx.Response:
    return httpx.Response(
        200, json={"status": "OK", "routes": [{"properties": {"totalTime": seconds}}]}
    )


def make_client(kakao_key: str = "kakao-key") -> TestClient:
    settings = Settings(_env_file=None, internal_api_token=TOKEN, kakao_rest_api_key=kakao_key)
    client = TestClient(create_app(settings), raise_server_exceptions=False)
    client.headers["X-Internal-Token"] = TOKEN
    return client


@pytest.fixture
def client() -> TestClient:
    return make_client()


@pytest.fixture
def routes():
    with respx.mock(assert_all_called=False) as router:
        router.get(CAR_URL).mock(return_value=car_ok(900))
        router.get(WALK_URL).mock(return_value=walk_ok(420))
        router.get(TRANSIT_URL).mock(return_value=transit_ok(1320))
        yield router


def leg(day, from_order, mode="TRANSIT", origin=HAEUNDAE, destination=JAGALCHI) -> dict:
    return {
        "day": day,
        "fromOrder": from_order,
        "toOrder": from_order + 1,
        "transportMode": mode,
        "from": origin,
        "to": destination,
    }


def post(client, legs):
    return client.post(PATH, json={"legs": legs})


def test_t04_11_each_leg_gets_the_provider_time_and_keeps_its_position(client, routes):
    response = post(client, [leg(1, 1, "CAR"), leg(1, 2, "WALK"), leg(2, 1, "TRANSIT")])

    assert response.status_code == 200
    legs = response.json()["data"]["legs"]
    assert [
        (row["day"], row["fromOrder"], row["toOrder"], row["transportMode"], row["durationSeconds"])
        for row in legs
    ] == [
        (1, 1, 2, "CAR", 900),
        (1, 2, 3, "WALK", 420),
        (2, 1, 2, "TRANSIT", 1320),
    ]
    assert {row["status"] for row in legs} == {"AVAILABLE"}


def test_t04_12_a_leg_the_provider_cannot_answer_is_unavailable_and_others_are_kept(client, routes):
    routes.get(WALK_URL).mock(return_value=httpx.Response(500))

    legs = post(client, [leg(1, 1, "CAR"), leg(1, 2, "WALK")]).json()["data"]["legs"]

    assert (legs[0]["status"], legs[0]["durationSeconds"]) == ("AVAILABLE", 900)
    assert (legs[1]["status"], legs[1]["durationSeconds"]) == ("UNAVAILABLE", None)


def test_t04_13_nearby_transit_without_a_route_comes_back_as_walk(client, routes):
    routes.get(TRANSIT_URL).mock(return_value=httpx.Response(200, json={"status": "NO_RESULTS"}))

    legs = post(client, [leg(1, 1, "TRANSIT", destination=NEARBY)]).json()["data"]["legs"]

    assert (legs[0]["transportMode"], legs[0]["durationSeconds"]) == ("WALK", 420)


def test_t04_14_without_a_kakao_key_every_leg_is_unavailable_and_nothing_is_called():
    with respx.mock(assert_all_called=False) as router:
        car = router.get(CAR_URL).mock(return_value=car_ok(900))

        response = post(make_client(kakao_key=""), [leg(1, 1, "CAR")])

    assert response.status_code == 200
    only = response.json()["data"]["legs"][0]
    assert (only["status"], only["durationSeconds"]) == ("UNAVAILABLE", None)
    assert not car.called


def test_t04_15_all_legs_share_one_query_time(client, routes):
    legs = post(client, [leg(1, 1, "CAR"), leg(1, 2, "WALK")]).json()["data"]["legs"]

    assert legs[0]["queriedAt"] == legs[1]["queriedAt"]
    assert legs[0]["queriedAt"].endswith("Z") or "+00:00" in legs[0]["queriedAt"]


def test_no_legs_gives_no_legs(client, routes):
    assert post(client, []).json()["data"]["legs"] == []


def test_t04_16_more_than_200_legs_is_a_validation_error(client, routes):
    response = post(client, [leg(1, 1)] * 201)

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert not routes.calls


@pytest.mark.parametrize(
    "broken",
    [
        {"transportMode": "BIKE"},
        {"from": {"latitude": 95.0, "longitude": 129.0}},
        {"fromOrder": 0},
    ],
    ids=["unknown-mode", "latitude-out-of-range", "order-zero"],
)
def test_invalid_leg_is_a_validation_error(client, routes, broken):
    response = post(client, [{**leg(1, 1), **broken}])

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_missing_internal_token_is_rejected(client):
    client.headers.pop("X-Internal-Token")

    assert post(client, [leg(1, 1)]).status_code == 401
