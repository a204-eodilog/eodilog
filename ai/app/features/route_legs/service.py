"""구간 이동 시간 다시 구하기 (spec §5.1). 사용자가 코스를 직접 고친 뒤 백엔드가 부른다.

시간은 길찾기 공급자 값만 쓴다. 못 구하면 null·UNAVAILABLE로 두고 채우지 않는다.
"""

import asyncio
from datetime import UTC, datetime
from typing import Literal

from pydantic import Field

from app.clients.kakao_routing import Coordinate, KakaoRoutingClient, TransportMode
from app.core.schemas import CamelModel

MAX_LEGS = 200  # 코스 항목 상한과 같다


class Position(CamelModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class LegQuery(CamelModel):
    day: int = Field(ge=1)
    from_order: int = Field(ge=1)
    to_order: int = Field(ge=1)
    transport_mode: TransportMode
    origin: Position = Field(alias="from")
    destination: Position = Field(alias="to")


class RouteLegsRequest(CamelModel):
    legs: list[LegQuery] = Field(max_length=MAX_LEGS)


class LegResult(CamelModel):
    day: int
    from_order: int
    to_order: int
    transport_mode: TransportMode
    duration_seconds: int | None
    status: Literal["AVAILABLE", "UNAVAILABLE"]
    queried_at: datetime


class RouteLegsResult(CamelModel):
    legs: list[LegResult]


class RouteLegCalculator:
    def __init__(self, *, routing: KakaoRoutingClient):
        self._routing = routing

    async def calculate(self, request: RouteLegsRequest) -> RouteLegsResult:
        queried_at = datetime.now(UTC)
        routes = await asyncio.gather(
            *(
                self._routing.leg(
                    _coordinate(leg.origin), _coordinate(leg.destination), leg.transport_mode
                )
                for leg in request.legs
            )
        )
        return RouteLegsResult(
            legs=[
                LegResult(
                    day=leg.day,
                    from_order=leg.from_order,
                    to_order=leg.to_order,
                    transport_mode=route.transport_mode,
                    duration_seconds=route.duration_seconds,
                    status=route.status,
                    queried_at=queried_at,
                )
                for leg, route in zip(request.legs, routes, strict=True)
            ]
        )


def _coordinate(position: Position) -> Coordinate:
    return Coordinate(latitude=position.latitude, longitude=position.longitude)
