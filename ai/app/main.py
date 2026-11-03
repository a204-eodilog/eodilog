import logging
import time
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request

from app.clients.gms import GmsClient
from app.clients.naver_local import NaverLocalClient
from app.clients.page_meta import PageMetaFetcher
from app.core.budget import RequestBudgetMiddleware
from app.core.config import Settings, get_settings
from app.core.errors import TRACE_HEADER, register_error_handlers, resolve_trace_id
from app.features.checklist_suggestion.router import router as checklist_suggestion_router
from app.features.checklist_suggestion.service import ChecklistSuggester
from app.features.place_extraction.router import router as place_extraction_router
from app.features.place_extraction.service import PlaceExtractor
from app.features.preference_inference.router import router as preference_inference_router
from app.features.preference_inference.service import PreferenceInferrer

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("ai")


def create_app(settings: Settings | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        await app.state.http.aclose()

    app = FastAPI(title="어디로그 AI 서버", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings or get_settings()
    app.state.http = httpx.AsyncClient()
    app.state.place_extractor = _build_place_extractor(app.state.settings, app.state.http)
    app.state.checklist_suggester = ChecklistSuggester(
        llm=_build_llm(app.state.settings, app.state.http)
    )
    app.state.preference_inferrer = PreferenceInferrer(
        llm=_build_llm(app.state.settings, app.state.http)
    )

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

    app.include_router(place_extraction_router)
    app.include_router(preference_inference_router)
    app.include_router(checklist_suggestion_router)

    return app


def _build_llm(settings: Settings, http: httpx.AsyncClient) -> GmsClient:
    return GmsClient(
        http,
        api_key=settings.gms_api_key,
        base_url=settings.gms_base_url,
        model=settings.llm_model,
        timeout_seconds=settings.llm_timeout_seconds,
    )


def _build_place_extractor(settings: Settings, http: httpx.AsyncClient) -> PlaceExtractor:
    return PlaceExtractor(
        llm=_build_llm(settings, http),
        places=NaverLocalClient(
            http,
            client_id=settings.naver_client_id,
            client_secret=settings.naver_client_secret,
            timeout_seconds=settings.place_search_timeout_seconds,
        ),
        pages=PageMetaFetcher(http, timeout_seconds=settings.link_timeout_seconds),
    )


app = create_app()
