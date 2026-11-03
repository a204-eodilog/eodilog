"""모든 오류를 백엔드 공통 형식으로 바꾼다 (api-spec §2)."""

import logging
import re
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.clients.errors import ProviderUnavailable
from app.core.schemas import ApiError, ErrorField

log = logging.getLogger("ai")

TRACE_HEADER = "X-Trace-Id"
# 백엔드가 jobId를 넣는다. 로그 위조를 막으려고 이 모양이 아니면 받지 않는다
_TRACE_ID = re.compile(r"[A-Za-z0-9-]{1,64}")

_HTTP_ERRORS = {
    401: ("UNAUTHENTICATED", "내부 토큰이 필요합니다."),
    403: ("FORBIDDEN", "접근할 수 없습니다."),
    404: ("NOT_FOUND", "요청한 자료를 찾을 수 없습니다."),
    405: ("METHOD_NOT_ALLOWED", "지원하지 않는 요청 방식입니다."),
}
_BAD_REQUEST = ("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.")
_INTERNAL = ("INTERNAL_ERROR", "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")
_UNAVAILABLE = (
    "PROVIDER_UNAVAILABLE",
    "외부 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
)


def resolve_trace_id(request: Request) -> str:
    value = request.headers.get(TRACE_HEADER, "")
    return value if _TRACE_ID.fullmatch(value) else uuid.uuid4().hex


def _trace_id(request: Request) -> str:
    return getattr(request.state, "trace_id", None) or resolve_trace_id(request)


def _error(
    request: Request,
    status: int,
    code: str,
    message: str,
    fields: list[ErrorField] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    trace_id = _trace_id(request)
    body = {
        "code": code,
        "message": message,
        "fields": [f.model_dump() for f in fields or []],
        "traceId": trace_id,
    }
    # 처리되지 않은 예외는 미들웨어 바깥에서 응답하므로 헤더를 여기서도 넣는다
    return JSONResponse(
        status_code=status,
        content={"error": body},
        headers={**(headers or {}), TRACE_HEADER: trace_id},
    )


def unavailable_response(request: Request) -> JSONResponse:
    return _error(request, 503, *_UNAVAILABLE)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ProviderUnavailable)
    async def provider_unavailable(request: Request, exc: ProviderUnavailable):
        return unavailable_response(request)

    @app.exception_handler(ApiError)
    async def api_error(request: Request, exc: ApiError):
        return _error(request, exc.status, exc.code, exc.message, exc.fields)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        fields = [
            ErrorField(
                field=".".join(str(p) for p in e["loc"] if p not in ("body", "query", "header")),
                message=e["msg"],
            )
            for e in exc.errors()
        ]
        return _error(request, 400, *_BAD_REQUEST, fields)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException):
        fallback = _BAD_REQUEST if exc.status_code < 500 else _INTERNAL
        code, message = _HTTP_ERRORS.get(exc.status_code, fallback)
        return _error(request, exc.status_code, code, message, headers=exc.headers)

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):
        log.exception("unhandled path=%s trace_id=%s", request.url.path, _trace_id(request))
        return _error(request, 500, *_INTERNAL)
