from fastapi import APIRouter, Depends

from app.core.schemas import Data
from app.core.security import require_internal_token
from app.features.visit_detection.service import (
    VisitDetectionRequest,
    VisitDetectionResult,
    detect_visits,
)

router = APIRouter(prefix="/ai/v1", dependencies=[Depends(require_internal_token)])


@router.post("/visit-detections")
async def visit_detections(body: VisitDetectionRequest) -> Data[VisitDetectionResult]:
    return Data(data=detect_visits(body))
