from fastapi import APIRouter, Depends, Request

from app.core.schemas import Data
from app.core.security import require_internal_token
from app.features.route_legs.service import (
    RouteLegCalculator,
    RouteLegsRequest,
    RouteLegsResult,
)

router = APIRouter(prefix="/ai/v1", dependencies=[Depends(require_internal_token)])


def get_calculator(request: Request) -> RouteLegCalculator:
    return request.app.state.route_leg_calculator


@router.post("/route-legs")
async def calculate_route_legs(
    body: RouteLegsRequest,
    calculator: RouteLegCalculator = Depends(get_calculator),
) -> Data[RouteLegsResult]:
    return Data(data=await calculator.calculate(body))
