from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from pydantic import ValidationError

from app.core.schemas import Data
from app.core.security import require_internal_token
from app.features.voice_expense.service import (
    MAX_AUDIO_BYTES,
    VoiceExpenseDrafter,
    VoiceExpenseMeta,
    VoiceExpenseResult,
    invalid,
)

router = APIRouter(prefix="/ai/v1", dependencies=[Depends(require_internal_token)])


def get_drafter(request: Request) -> VoiceExpenseDrafter:
    return request.app.state.voice_expense_drafter


@router.post("/voice-expense-drafts")
async def draft_voice_expenses(
    audio: UploadFile = File(),
    meta: str = Form(),
    drafter: VoiceExpenseDrafter = Depends(get_drafter),
) -> Data[VoiceExpenseResult]:
    try:
        parsed = VoiceExpenseMeta.model_validate_json(meta)
    except ValidationError as e:
        await audio.close()
        raise invalid("meta", "language, timeZone, referenceAt이 있는 JSON이어야 합니다.") from e

    # 초과 여부만 알면 되므로 한도보다 1바이트만 더 읽고, 임시 파일은 바로 지운다
    data = await audio.read(MAX_AUDIO_BYTES + 1)
    await audio.close()
    transcript = await drafter.transcribe(data, parsed)
    # 받아쓴 뒤로는 원음이 필요 없다. 구조화 추출 동안 들고 있지 않는다
    del data
    return Data(data=await drafter.draft(transcript, parsed))
