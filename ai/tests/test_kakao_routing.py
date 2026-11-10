"""구간 이동 시간 (spec §5): 공급자 값만 쓰고, 못 구하면 null·UNAVAILABLE."""

import httpx
import pytest
import respx

from app.clients.kakao_routing import Coordinate, KakaoRoutingClient, TransportMode

CAR_URL = "https://apis-navi.kakaomobility.com/v1/directions"
WALK_URL = "https://dapi.kakao.com/v2/routing/walk"
TRANSIT_URL = "https://dapi.kakao.com/v2/routing/publictraffic"
KEY = "kakao-secret-key"

ORIGIN = Coordinate(latitude=35.1000, longitude=129.0000)
NEARBY = Coordinate(latitude=35.1050, longitude=129.0000)  # 약 550m
FAR = Coordinate(latitude=35.5000, longitude=129.0000)  # 약 44km

CAR_OK = {"routes": [{"result_code": 0, "summary": {"duration": 900, "distance": 8000}}]}
WALK_OK = {"status": "OK", "route": {"properties": {"totalTime": 420, "totalDistance": 550}}}
TRANSIT_OK = {
    "status": "OK",
    "routes": [{"properties": {"totalTime": 1320, "totalDistance": 9000}}],
}
NO_RESULTS = {"status": "NO_RESULTS"}


@pytest.fixture
async def routing():
    async with httpx.AsyncClient() as http:
        yield KakaoRoutingClient(http, api_key=KEY, timeout_seconds=1)


METERS = {"CAR": 8000, "WALK": 550, "TRANSIT": 9000}


def unavailable(mode: str) -> dict:
    return {
        "transportMode": mode,
        "durationSeconds": None,
        "distanceMeters": None,
        "status": "UNAVAILABLE",
    }


def available(mode: str, seconds: int) -> dict:
    return {
        "transportMode": mode,
        "durationSeconds": seconds,
        "distanceMeters": METERS[mode],
        "status": "AVAILABLE",
    }


@respx.mock
async def test_car_uses_directions_with_lng_lat_order(routing):
    route = respx.get(CAR_URL).mock(return_value=httpx.Response(200, json=CAR_OK))

    leg = await routing.leg(ORIGIN, FAR, TransportMode.CAR)

    assert leg.model_dump(by_alias=True) == available("CAR", 900)
    request = route.calls.last.request
    assert request.url.params["origin"] == "129.0,35.1"
    assert request.url.params["destination"] == "129.0,35.5"
    assert request.headers["Authorization"] == f"KakaoAK {KEY}"


@respx.mock
async def test_walk_uses_walk_route_with_x_y_params(routing):
    route = respx.get(WALK_URL).mock(return_value=httpx.Response(200, json=WALK_OK))

    leg = await routing.leg(ORIGIN, NEARBY, TransportMode.WALK)

    assert leg.model_dump(by_alias=True) == available("WALK", 420)
    params = route.calls.last.request.url.params
    assert (params["start_x"], params["start_y"]) == ("129.0", "35.1")
    assert (params["end_x"], params["end_y"]) == ("129.0", "35.105")


@respx.mock
async def test_transit_returns_provider_time(routing):
    respx.get(TRANSIT_URL).mock(return_value=httpx.Response(200, json=TRANSIT_OK))

    leg = await routing.leg(ORIGIN, FAR, TransportMode.TRANSIT)

    assert leg.model_dump(by_alias=True) == available("TRANSIT", 1320)


@respx.mock
async def test_nearby_transit_without_route_becomes_walk(routing):
    respx.get(TRANSIT_URL).mock(return_value=httpx.Response(200, json=NO_RESULTS))
    respx.get(WALK_URL).mock(return_value=httpx.Response(200, json=WALK_OK))

    leg = await routing.leg(ORIGIN, NEARBY, TransportMode.TRANSIT)

    assert leg.model_dump(by_alias=True) == available("WALK", 420)


@respx.mock
async def test_far_transit_without_route_is_unavailable_not_hours_of_walking(routing):
    respx.get(TRANSIT_URL).mock(return_value=httpx.Response(200, json=NO_RESULTS))
    walk = respx.get(WALK_URL).mock(return_value=httpx.Response(200, json=WALK_OK))

    leg = await routing.leg(ORIGIN, FAR, TransportMode.TRANSIT)

    assert leg.model_dump(by_alias=True) == unavailable("TRANSIT")
    assert not walk.called


@respx.mock
async def test_nearby_transit_provider_error_is_unavailable_not_walk(routing):
    # 장애는 "경로 없음"이 아니다. 도보로 바꾸면 사용자가 고른 수단이 조용히 바뀐다
    respx.get(TRANSIT_URL).mock(return_value=httpx.Response(500))
    walk = respx.get(WALK_URL).mock(return_value=httpx.Response(200, json=WALK_OK))

    leg = await routing.leg(ORIGIN, NEARBY, TransportMode.TRANSIT)

    assert leg.model_dump(by_alias=True) == unavailable("TRANSIT")
    assert not walk.called


@pytest.mark.parametrize(
    ("mode", "url", "body"),
    [
        (TransportMode.CAR, CAR_URL, {"routes": [{"result_code": 104}]}),
        (TransportMode.CAR, CAR_URL, {"routes": []}),
        (TransportMode.CAR, CAR_URL, {"routes": [{"result_code": 0, "summary": {}}]}),
        (TransportMode.WALK, WALK_URL, NO_RESULTS),
        (TransportMode.WALK, WALK_URL, {"status": "OK", "route": {"properties": {}}}),
        (TransportMode.TRANSIT, TRANSIT_URL, {"status": "OK", "routes": []}),
    ],
    ids=[
        "car-no-route",
        "car-empty",
        "car-no-duration",
        "walk-none",
        "walk-no-time",
        "transit-empty",
    ],
)
@respx.mock
async def test_unusable_responses_are_unavailable(routing, mode, url, body):
    respx.get(url).mock(return_value=httpx.Response(200, json=body))

    leg = await routing.leg(ORIGIN, FAR, mode)

    assert leg.model_dump(by_alias=True) == unavailable(mode.value)


@pytest.mark.parametrize(
    "mock",
    [{"side_effect": httpx.ReadTimeout("slow")}, {"return_value": httpx.Response(200, text="x")}],
    ids=["timeout", "body-not-json"],
)
@respx.mock
async def test_failures_are_unavailable_not_exceptions(routing, mock):
    respx.get(CAR_URL).mock(**mock)

    leg = await routing.leg(ORIGIN, FAR, TransportMode.CAR)

    assert leg.model_dump(by_alias=True) == unavailable("CAR")


@respx.mock
async def test_missing_key_is_unavailable_without_calling():
    route = respx.get(CAR_URL)
    async with httpx.AsyncClient() as http:
        routing = KakaoRoutingClient(http, api_key="", timeout_seconds=1)

        leg = await routing.leg(ORIGIN, FAR, TransportMode.CAR)

    assert leg.model_dump(by_alias=True) == unavailable("CAR")
    assert not route.called


@pytest.mark.parametrize("distance", [None, -1, "abc"], ids=["missing", "negative", "not-a-number"])
@pytest.mark.parametrize(
    ("mode", "url", "body"),
    [
        (
            TransportMode.CAR,
            CAR_URL,
            lambda d: {"routes": [{"result_code": 0, "summary": {"duration": 900, "distance": d}}]},
        ),
        (
            TransportMode.WALK,
            WALK_URL,
            lambda d: {
                "status": "OK",
                "route": {"properties": {"totalTime": 900, "totalDistance": d}},
            },
        ),
        (
            TransportMode.TRANSIT,
            TRANSIT_URL,
            lambda d: {
                "status": "OK",
                "routes": [{"properties": {"totalTime": 900, "totalDistance": d}}],
            },
        ),
    ],
    ids=["car", "walk", "transit"],
)
@respx.mock
async def test_unusable_distance_keeps_the_time(routing, mode, url, body, distance):
    respx.get(url).mock(return_value=httpx.Response(200, json=body(distance)))

    leg = await routing.leg(ORIGIN, FAR, mode)

    assert (leg.status, leg.duration_seconds, leg.distance_meters) == ("AVAILABLE", 900, None)
