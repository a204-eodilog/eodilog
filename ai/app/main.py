import logging
import time

from fastapi import FastAPI, Request

from app.core.budget import RequestBudgetMiddleware
from app.core.config import Settings, get_settings
from app.core.errors import TRACE_HEADER, register_error_handlers, resolve_trace_id

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("ai")


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(title="어디로그 AI 서버", version="0.1.0")
    app.state.settings = settings or get_settings()

    # 뒤에 등록한 미들웨어가 바깥을 감싼다. 예산 초과 503에도 trace가 추적 ID를 붙인다
    app.add_middleware(RequestBudgetMiddleware, seconds=app.state.settings.request_budget_seconds)

    @app.middleware("http")
    async def trace(request: Request, call_next):
        request.state.trace_id = resolve_trace_id(request)
        started = time.perf_counter()
        response = await call_next(request)
        response.headers[TRACE_HEADER] = request.state.trace_id
        log.info(
            "path=%s status=%s trace_id=%s elapsed_ms=%d",
            request.url.path,
            response.status_code,
            request.state.trace_id,
            (time.perf_counter() - started) * 1000,
        )
        return response

    register_error_handlers(app)

    # 배포 상태 확인용이라 내부 토큰을 요구하지 않는다
    @app.get("/ai/v1/health")
    async def health():
        return {"data": {"status": "ok"}}

    return app


app = create_app()
