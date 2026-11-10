"""장소 사이 이동 시간 (spec §5). 자동차는 카카오모빌리티, 도보·대중교통은 카카오맵 경로 API.

구하지 못하면 durationSeconds=null, status=UNAVAILABLE. 0초나 직선거리로 채우지 않는다.
"""

import logging
import math
from dataclasses import dataclass
from enum import StrEnum
from typing import Literal

import httpx

from app.core.metrics import record_provider_failure
from app.core.schemas import CamelModel

log = logging.getLogger("ai")

CAR_URL = "https://apis-navi.kakaomobility.com/v1/directions"
WALK_URL = "https://dapi.kakao.com/v2/routing/walk"
TRANSIT_URL = "https://dapi.kakao.com/v2/routing/publictraffic"

# 이 거리 안에서 대중교통 경로가 없으면 도보 구간으로 바꾼다. 대체 여부 판단에만 쓰는 값이다
NEAR_ENOUGH_TO_WALK_METERS = 1000
_EARTH_RADIUS_METERS = 6_371_000


class TransportMode(StrEnum):
    WALK = "WALK"
    CAR = "CAR"
    TRANSIT = "TRANSIT"


@dataclass(frozen=True)
class Coordinate:
    latitude: float
    longitude: float


@dataclass(frozen=True)
class _Measured:
    seconds: int
    meters: int | None


class RouteLeg(CamelModel):
    transport_mode: TransportMode
    duration_seconds: int | None
    distance_meters: int | None = None
    status: Literal["AVAILABLE", "UNAVAILABLE"]


class KakaoRoutingClient:
    def __init__(self, http: httpx.AsyncClient, *, api_key: str, timeout_seconds: float):
        self._http = http
        self._key = api_key
        self._timeout = timeout_seconds

    async def leg(
        self, origin: Coordinate, destination: Coordinate, mode: TransportMode
    ) -> RouteLeg:
        if not self._key:
            record_provider_failure()
            return _leg(mode, None)
        try:
            measured = await self._measured(origin, destination, mode)
            if (
                measured is None
                and mode is TransportMode.TRANSIT
                and straight_line_meters(origin, destination) <= NEAR_ENOUGH_TO_WALK_METERS
            ):
                mode = TransportMode.WALK
                measured = await self._measured(origin, destination, mode)
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError, AttributeError) as e:
            record_provider_failure()
            log.warning("route_failed mode=%s error=%s", mode.value, type(e).__name__)
            return _leg(mode, None)
        return _leg(mode, measured)

    async def _measured(
        self, origin: Coordinate, destination: Coordinate, mode: TransportMode
    ) -> _Measured | None:
        """경로 없음은 None, 장애와 형식 오류는 예외로 구분한다."""
        if mode is TransportMode.CAR:
            return await self._car(origin, destination)
        url = WALK_URL if mode is TransportMode.WALK else TRANSIT_URL
        body = await self._get(
            url,
            {
                "start_x": origin.longitude,
                "start_y": origin.latitude,
                "end_x": destination.longitude,
                "end_y": destination.latitude,
            },
        )
        if body.get("status") != "OK":
            return None
        if mode is TransportMode.WALK:
            return _from_properties(body["route"]["properties"])
        routes = body.get("routes")
        return _from_properties(routes[0]["properties"]) if routes else None

    async def _car(self, origin: Coordinate, destination: Coordinate) -> _Measured | None:
        body = await self._get(
            CAR_URL,
            {
                "origin": f"{origin.longitude},{origin.latitude}",
                "destination": f"{destination.longitude},{destination.latitude}",
            },
        )
        route = body["routes"][0]
        if route.get("result_code") != 0:
            return None
        summary = route["summary"]
        return _Measured(int(summary["duration"]), _meters(summary.get("distance")))

    async def _get(self, url: str, params: dict) -> dict:
        response = await self._http.get(
            url,
            params=params,
            headers={"Authorization": f"KakaoAK {self._key}"},
            timeout=self._timeout,
        )
        response.raise_for_status()
        return response.json()


def _from_properties(properties: dict) -> _Measured:
    return _Measured(int(properties["totalTime"]), _meters(properties.get("totalDistance")))


def _meters(raw: object) -> int | None:
    """거리를 못 읽어도 이동 시간은 버리지 않는다."""
    try:
        meters = int(raw)
    except (TypeError, ValueError):
        return None
    return meters if meters >= 0 else None


def _leg(mode: TransportMode, measured: _Measured | None) -> RouteLeg:
    if measured is None:
        return RouteLeg(transport_mode=mode, duration_seconds=None, status="UNAVAILABLE")
    return RouteLeg(
        transport_mode=mode,
        duration_seconds=measured.seconds,
        distance_meters=measured.meters,
        status="AVAILABLE",
    )


def straight_line_meters(a: Coordinate, b: Coordinate) -> float:
    lat_a, lat_b = math.radians(a.latitude), math.radians(b.latitude)
    half_lat = (lat_b - lat_a) / 2
    half_lng = math.radians(b.longitude - a.longitude) / 2
    h = math.sin(half_lat) ** 2 + math.cos(lat_a) * math.cos(lat_b) * math.sin(half_lng) ** 2
    return 2 * _EARTH_RADIUS_METERS * math.asin(math.sqrt(h))
