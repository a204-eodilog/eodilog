from fastapi import APIRouter, Depends

from app.core.schemas import Data
from app.core.security import require_internal_token
from app.features.recommendations.service import (
    DiscoveryRequest,
    DiscoveryResult,
    FollowRequest,
    FollowResult,
    recommend_similar,
    suggest_follows,
)

router = APIRouter(prefix="/ai/v1", dependencies=[Depends(require_internal_token)])


@router.post("/discovery-recommendations")
async def discovery_recommendations(body: DiscoveryRequest) -> Data[DiscoveryResult]:
    return Data(data=recommend_similar(body))


@router.post("/follow-suggestions")
async def follow_suggestions(body: FollowRequest) -> Data[FollowResult]:
    return Data(data=suggest_follows(body))
