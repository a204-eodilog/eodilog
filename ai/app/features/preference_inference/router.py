from fastapi import APIRouter, Depends, Request

from app.core.schemas import CamelModel, Data
from app.core.security import require_internal_token
from app.features.preference_inference.service import (
    InferenceResult,
    PreferenceInferrer,
    PreferenceItem,
    SavedPlace,
)

router = APIRouter(prefix="/ai/v1", dependencies=[Depends(require_internal_token)])


class InferenceRequest(CamelModel):
    user_id: str
    saved_places: list[SavedPlace]
    explicit_items: list[PreferenceItem] = []
    rejected_keys: list[str] = []


def get_inferrer(request: Request) -> PreferenceInferrer:
    return request.app.state.preference_inferrer


@router.post("/preference-inferences")
async def infer_preferences(
    body: InferenceRequest,
    inferrer: PreferenceInferrer = Depends(get_inferrer),
) -> Data[InferenceResult]:
    result = await inferrer.infer(
        body.saved_places,
        explicit_keys={item.key for item in body.explicit_items},
        rejected_keys=set(body.rejected_keys),
    )
    return Data(data=result)
