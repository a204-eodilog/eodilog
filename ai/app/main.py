import logging
import time
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request

from app.clients.gms import GmsClient
from app.clients.kakao_routing import KakaoRoutingClient
from app.clients.naver_local import NaverLocalClient
from app.clients.page_meta import PageMetaFetcher
from app.core.budget import RequestBudgetMiddleware
from app.core.config import Settings, get_settings
from app.core.errors import TRACE_HEADER, register_error_handlers, resolve_trace_id
from app.core.metrics import RequestUsage, begin_usage
from app.features.checklist_suggestion.router import router as checklist_suggestion_router
from app.features.checklist_suggestion.service import ChecklistSuggester
from app.features.itinerary_proposal.router import router as itinerary_proposal_router
from app.features.itinerary_proposal.service import ItineraryProposer
from app.features.photo_classification.embedder import SiglipEmbedder
from app.features.photo_classification.router import router as photo_classification_router
from app.features.photo_classification.service import (
    TOPIC_HEAD_PATH,
    PhotoClassifier,
    load_topic_head,
)
from app.features.place_extraction.router import router as place_extraction_router
from app.features.place_extraction.service import PlaceExtractor
from app.features.preference_inference.router import router as preference_inference_router
from app.features.preference_inference.service import PreferenceInferrer
from app.features.recommendations.router import router as recommendations_router
from app.features.route_legs.router import router as route_legs_router
from app.features.route_legs.service import RouteLegCalculator
from app.features.trip_recommendation.router import router as trip_recommendation_router
from app.features.trip_recommendation.service import TripRecommender
from app.features.visit_detection.router import router as visit_detection_router
from app.features.weather_alternatives.router import router as weather_alternatives_router
from app.features.weather_alternatives.service import WeatherAlternativeSuggester

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("ai")

API_PREFIX = "/ai/v1/"


def _check_internal_token(settings: Settings) -> None:
    if settings.internal_api_token.strip():
        return
    if settings.allow_no_internal_token:
        log.warning("internal_token_check_disabled")
        return
    raise RuntimeError(
        "INTERNAL_API_TOKEN이 없어 서버를 시작하지 않습니다. "
        "로컬 개발이면 ALLOW_NO_INTERNAL_TOKEN=true를 설정하세요."
    )


def _outcome(status: int, usage: RequestUsage) -> str:
    if status >= 500:
        return "failure"
    if status >= 400:
        return "client_error"
    return "degraded" if usage.provider_failures else "success"


def _log_metrics(request: Request, status: int, usage: RequestUsage, started: float) -> None:
    """기능별 지연·토큰·실패율을 이 줄에서 집계한다. 등록된 경로 이름만 남긴다."""
    route = request.scope.get("route")
    log.info(
        "request_metrics feature=%s status=%s outcome=%s trace_id=%s elapsed_ms=%d "
        "llm_calls=%d prompt_tokens=%d completion_tokens=%d provider_failures=%d",
        route.path.removeprefix(API_PREFIX) if route else "unmatched",
        status,
        _outcome(status, usage),
        request.state.trace_id,
        (time.perf_counter() - started) * 1000,
        usage.llm_calls,
        usage.prompt_tokens,
        usage.completion_tokens,
        usage.provider_failures,
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        _check_internal_token(app.state.settings)
        if app.state.settings.photo_model_preload:
            await app.state.photo_classifier.preload()
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
    app.state.trip_recommender = TripRecommender(llm=_build_llm(app.state.settings, app.state.http))
    routing = KakaoRoutingClient(
        app.state.http,
        api_key=app.state.settings.kakao_rest_api_key,
        timeout_seconds=app.state.settings.kakao_timeout_seconds,
    )
    app.state.weather_alternative_suggester = WeatherAlternativeSuggester(routing=routing)
    app.state.itinerary_proposer = ItineraryProposer(routing=routing)
    app.state.route_leg_calculator = RouteLegCalculator(routing=routing)
    app.state.photo_classifier = PhotoClassifier(
        embedder=SiglipEmbedder(
            model_name=app.state.settings.clip_model,
            pretrained=app.state.settings.clip_pretrained,
        ),
        similarity_threshold=app.state.settings.photo_similarity_threshold,
        topic_head=load_topic_head(TOPIC_HEAD_PATH),
    )

    # 뒤에 등록한 미들웨어가 바깥을 감싼다. 예산 초과 503에도 trace가 추적 ID를 붙인다
    app.add_middleware(RequestBudgetMiddleware, seconds=app.state.settings.request_budget_seconds)

    @app.middleware("http")
    async def trace(request: Request, call_next):
        request.state.trace_id = resolve_trace_id(request)
        started = time.perf_counter()
        usage = begin_usage()
        try:
            response = await call_next(request)
        except Exception:
            # 처리되지 않은 예외는 이 미들웨어 바깥에서 500이 된다
            _log_metrics(request, 500, usage, started)
            raise
        response.headers[TRACE_HEADER] = request.state.trace_id
        _log_metrics(request, response.status_code, usage, started)
        return response

    register_error_handlers(app)

    # 배포 상태 확인용이라 내부 토큰을 요구하지 않는다
    @app.get("/ai/v1/health")
    async def health():
        return {"data": {"status": "ok"}}

    app.include_router(place_extraction_router)
    app.include_router(preference_inference_router)
    app.include_router(checklist_suggestion_router)
    app.include_router(trip_recommendation_router)
    app.include_router(weather_alternatives_router)
    app.include_router(itinerary_proposal_router)
    app.include_router(photo_classification_router)
    app.include_router(recommendations_router)
    app.include_router(route_legs_router)
    app.include_router(visit_detection_router)

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
