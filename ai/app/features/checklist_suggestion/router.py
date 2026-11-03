from fastapi import APIRouter, Depends, Request

from app.core.schemas import Data
from app.core.security import require_internal_token
from app.features.checklist_suggestion.service import (
    ChecklistRequest,
    ChecklistSuggester,
    SuggestionResult,
)

router = APIRouter(prefix="/ai/v1", dependencies=[Depends(require_internal_token)])


def get_suggester(request: Request) -> ChecklistSuggester:
    return request.app.state.checklist_suggester


@router.post("/checklist-suggestions")
async def suggest_checklist(
    body: ChecklistRequest,
    suggester: ChecklistSuggester = Depends(get_suggester),
) -> Data[SuggestionResult]:
    return Data(data=await suggester.suggest(body))
