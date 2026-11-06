from fastapi import APIRouter, Depends, Request

from app.core.schemas import Data
from app.core.security import require_internal_token
from app.features.weather_alternatives.service import (
    WeatherAlternativesRequest,
    WeatherAlternativesResult,
    WeatherAlternativeSuggester,
)

router = APIRouter(prefix="/ai/v1", dependencies=[Depends(require_internal_token)])


def get_suggester(request: Request) -> WeatherAlternativeSuggester:
    return request.app.state.weather_alternative_suggester


@router.post("/weather-alternatives")
async def suggest_weather_alternatives(
    body: WeatherAlternativesRequest,
    suggester: WeatherAlternativeSuggester = Depends(get_suggester),
) -> Data[WeatherAlternativesResult]:
    return Data(data=await suggester.suggest(body))
