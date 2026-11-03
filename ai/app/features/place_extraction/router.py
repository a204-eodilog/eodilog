from fastapi import APIRouter, Depends, File, Form, Request, UploadFile

from app.core.schemas import ApiError, Data, ErrorField
from app.core.security import require_internal_token
from app.features.place_extraction.service import (
    ExtractionInput,
    ExtractionResult,
    PlaceExtractor,
)

MAX_CAPTURES = 10
MAX_CAPTURE_BYTES = 15 * 1024 * 1024

router = APIRouter(prefix="/ai/v1", dependencies=[Depends(require_internal_token)])


def get_extractor(request: Request) -> PlaceExtractor:
    return request.app.state.place_extractor


@router.post("/place-extractions")
async def extract_places(
    url: str | None = Form(default=None, max_length=2048),
    captures: list[UploadFile] = File(default=[]),
    memo: str | None = Form(default=None, max_length=500),
    region_hint: str | None = Form(default=None, alias="regionHint", max_length=50),
    extractor: PlaceExtractor = Depends(get_extractor),
) -> Data[ExtractionResult]:
    url = (url or "").strip() or None
    if not url and not captures:
        message = "url이나 captures 중 하나는 필요합니다."
        raise ApiError(
            400,
            "VALIDATION_ERROR",
            "요청 값이 올바르지 않습니다.",
            [
                ErrorField(field="url", message=message),
                ErrorField(field="captures", message=message),
            ],
        )
    if len(captures) > MAX_CAPTURES:
        raise _limit_exceeded(f"캡처는 {MAX_CAPTURES}장까지입니다.")

    blobs = []
    for capture in captures:
        blob = await capture.read(MAX_CAPTURE_BYTES + 1)
        if len(blob) > MAX_CAPTURE_BYTES:
            raise _limit_exceeded("캡처는 장당 15MB까지입니다.")
        blobs.append(blob)

    result = await extractor.extract(
        ExtractionInput(url=url, captures=blobs, memo=memo, region_hint=region_hint)
    )
    return Data(data=result)


def _limit_exceeded(message: str) -> ApiError:
    return ApiError(
        422,
        "INPUT_LIMIT_EXCEEDED",
        "입력 개수나 크기를 넘었습니다.",
        [ErrorField(field="captures", message=message)],
    )
