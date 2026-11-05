from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from pydantic import ValidationError

from app.core.schemas import ApiError, CamelModel, Data, ErrorField
from app.core.security import require_internal_token
from app.features.photo_classification.service import (
    MAX_PHOTO_BYTES,
    ClassificationResult,
    PhotoClassifier,
    PhotoUpload,
)

MAX_PHOTOS = 50

router = APIRouter(prefix="/ai/v1", dependencies=[Depends(require_internal_token)])


class ClassificationMeta(CamelModel):
    photo_ids: list[str]


def get_classifier(request: Request) -> PhotoClassifier:
    return request.app.state.photo_classifier


@router.post("/photo-classifications")
async def classify_photos(
    meta: str = Form(),
    files: list[UploadFile] = File(),
    classifier: PhotoClassifier = Depends(get_classifier),
) -> Data[ClassificationResult]:
    photo_ids = _parse_photo_ids(meta)
    if len(files) > MAX_PHOTOS:
        raise ApiError(
            422,
            "INPUT_LIMIT_EXCEEDED",
            "입력 개수나 크기를 넘었습니다.",
            [ErrorField(field="files", message=f"사진은 {MAX_PHOTOS}장까지입니다.")],
        )
    if len(photo_ids) != len(files):
        raise _invalid("meta.photoIds", "photoIds와 files의 개수가 같아야 합니다.")

    # 초과 여부만 알면 되므로 한도보다 1바이트만 더 읽는다
    uploads = [
        PhotoUpload(photo_id=photo_id, data=await file.read(MAX_PHOTO_BYTES + 1))
        for photo_id, file in zip(photo_ids, files, strict=True)
    ]
    return Data(data=await classifier.classify(uploads))


def _parse_photo_ids(meta: str) -> list[str]:
    try:
        return ClassificationMeta.model_validate_json(meta).photo_ids
    except ValidationError as e:
        raise _invalid("meta", "photoIds 목록이 있는 JSON이어야 합니다.") from e


def _invalid(field: str, message: str) -> ApiError:
    return ApiError(
        400,
        "VALIDATION_ERROR",
        "요청 값이 올바르지 않습니다.",
        [ErrorField(field=field, message=message)],
    )
