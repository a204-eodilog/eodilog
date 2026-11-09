from fastapi import APIRouter, Depends, Request

from app.core.schemas import Data
from app.core.security import require_internal_token
from app.features.trip_recommendation.service import (
    RecommendationResult,
    TripRecommendationRequest,
    TripRecommender,
)

router = APIRouter(prefix="/ai/v1", dependencies=[Depends(require_internal_token)])


def get_recommender(request: Request) -> TripRecommender:
    return request.app.state.trip_recommender


@router.post("/trip-recommendations")
async def recommend_trip(
    body: TripRecommendationRequest,
    recommender: TripRecommender = Depends(get_recommender),
) -> Data[RecommendationResult]:
    return Data(data=await recommender.recommend(body))
