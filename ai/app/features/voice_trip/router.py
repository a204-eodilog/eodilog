"""말로 새 여행 만들기 (실험) API.

- POST /jobs: 쭉 말한 녹음(최대 10분) 또는 글 → 작업 ID. 정리는 뒤에서 돈다
- GET /jobs/{jobId}: 단계와 결과 초안
- POST /fixes: 지금 초안 + 고칠 말(녹음 1분 또는 글) → 바꿀 명령과 변경 목록
- POST /candidates: AI가 고른 곳 대신 고를 근처 후보
"""

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from pydantic import Field, ValidationError

from app.core.schemas import ApiError, CamelModel, Data, ErrorField
from app.core.security import require_internal_token
from app.features.voice_expense.audio import AudioInvalid, inspect_m4a
from app.features.voice_trip.jobs import TripJobView, seoul_today
from app.features.voice_trip.service import Candidate, FixResult, TripDraft

router = APIRouter(prefix="/ai/v1/voice-trip", dependencies=[Depends(require_internal_token)])

# 64kbps 10분 ≈ 4.8MB. 여유를 둔다
MAX_LONG_BYTES = 12 * 1024 * 1024
MAX_LONG_SECONDS = 10 * 60 + 5
MAX_FIX_BYTES = 2 * 1024 * 1024
MAX_FIX_SECONDS = 60 + 2
MAX_TEXT_CHARS = 8000
MAX_FIX_TEXT_CHARS = 500
# 웹 미리보기는 webm으로 녹음한다(EBML 머리)
WEBM_MAGIC = b"\x1a\x45\xdf\xa3"


def invalid(field: str, message: str) -> ApiError:
    return ApiError(400, "VALIDATION_ERROR", message, [ErrorField(field=field, message=message)])


async def _read_audio(audio: UploadFile, max_bytes: int, max_seconds: float) -> bytes:
    data = await audio.read(max_bytes + 1)
    await audio.close()
    if not data:
        raise invalid("audio", "녹음 파일이 비었습니다.")
    if len(data) > max_bytes:
        raise ApiError(422, "INPUT_LIMIT_EXCEEDED", "녹음이 너무 큽니다.")
    if data.startswith(WEBM_MAGIC):
        return data
    try:
        info = inspect_m4a(data)
    except AudioInvalid as e:
        raise invalid("audio", "M4A(AAC) 녹음이어야 합니다.") from e
    if info.duration_seconds > max_seconds:
        raise ApiError(422, "INPUT_LIMIT_EXCEEDED", "녹음이 너무 깁니다.")
    return data


@router.post("/jobs", status_code=202)
async def start_job(
    request: Request,
    text: str | None = Form(default=None),
    audio: UploadFile | None = File(default=None),
) -> Data[TripJobView]:
    data: bytes | None = None
    if audio is not None:
        data = await _read_audio(audio, MAX_LONG_BYTES, MAX_LONG_SECONDS)
    elif not (text and text.strip()):
        raise invalid("audio", "녹음이나 text가 있어야 합니다.")
    jobs = request.app.state.voice_trip_jobs
    job_id = jobs.start(
        audio=data,
        text=text.strip()[:MAX_TEXT_CHARS] if data is None and text else None,
        stt=request.app.state.voice_trip_stt,
        maker=request.app.state.voice_trip_maker,
    )
    return Data(data=jobs.get(job_id))


@router.get("/jobs/{job_id}")
async def get_job(request: Request, job_id: str) -> Data[TripJobView]:
    view = request.app.state.voice_trip_jobs.get(job_id)
    if view is None:
        raise ApiError(404, "NOT_FOUND", "작업이 없거나 끝난 지 오래됐어요.")
    return Data(data=view)


@router.post("/fixes")
async def fix_draft(
    request: Request,
    draft: str = Form(),
    text: str | None = Form(default=None),
    audio: UploadFile | None = File(default=None),
) -> Data[FixResult]:
    try:
        parsed = TripDraft.model_validate_json(draft)
    except ValidationError as e:
        if audio:
            await audio.close()
        raise invalid("draft", "초안 JSON이 맞지 않습니다.") from e
    if audio is not None:
        data = await _read_audio(audio, MAX_FIX_BYTES, MAX_FIX_SECONDS)
        heard = await request.app.state.voice_trip_stt.transcribe(data, hints=_hints(parsed))
        del data
        said = heard.text.strip()
        if not said:
            raise ApiError(422, "INSUFFICIENT_DATA", "말소리를 듣지 못했어요.")
    elif text and text.strip():
        said = text.strip()[:MAX_FIX_TEXT_CHARS]
    else:
        raise invalid("audio", "녹음이나 text가 있어야 합니다.")
    maker = request.app.state.voice_trip_maker
    return Data(data=await maker.fix(parsed, said, today=seoul_today()))


def _hints(draft: TripDraft) -> list[str]:
    names = [d.name for d in draft.destinations]
    names += [i.place.name if i.place else i.query for i in draft.items]
    return list(dict.fromkeys(n for n in names if n))[:30]


class Near(CamelModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class CandidateRequest(CamelModel):
    query: str = Field(min_length=1, max_length=40)
    destination: str | None = Field(default=None, max_length=40)
    near: Near | None = None


@router.post("/candidates")
async def candidates(request: Request, body: CandidateRequest) -> Data[list[Candidate]]:
    maker = request.app.state.voice_trip_maker
    near = (body.near.latitude, body.near.longitude) if body.near else None
    return Data(data=await maker.candidates(body.query, destination=body.destination, near=near))
