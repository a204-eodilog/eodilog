"""운영 지표 로그: 요청마다 기능·지연·토큰·실패를 한 줄로 남긴다 (tasks 15)."""

import asyncio
import json
import logging
from io import BytesIO

import httpx
import pytest
import respx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from app.clients.kakao_routing import Coordinate, KakaoRoutingClient, TransportMode
from app.clients.naver_local import NaverLocalClient, PlaceSearchUnavailable
from app.core.config import Settings
from app.core.metrics import begin_usage, record_llm_call
from app.main import create_app

CHECKLIST = "/ai/v1/checklist-suggestions"
PLACES = "/ai/v1/place-extractions"
GMS_URL = "https://gms.test/v1/chat/completions"
NAVER_URL = "https://naverapihub.apigw.ntruss.com/search/v1/local"
CAR_URL = "https://apis-navi.kakaomobility.com/v1/directions"
TOKEN = "internal-secret-token"
GMS_KEY = "gms-secret-key"
TRACE_ID = "job-123"
BODY = {
    "jobId": "11111111-1111-1111-1111-111111111111",
    "trip": {"startDate": "2026-11-14", "endDate": "2026-11-15"},
}
ORIGIN = Coordinate(latitude=35.1, longitude=129.0)
DESTINATION = Coordinate(latitude=35.5, longitude=129.0)


def build_app(**overrides) -> FastAPI:
    settings = {
        "internal_api_token": TOKEN,
        "gms_api_key": GMS_KEY,
        "gms_base_url": "https://gms.test/v1",
        **overrides,
    }
    return create_app(Settings(_env_file=None, **settings))


def build_client(app: FastAPI | None = None) -> TestClient:
    client = TestClient(app or build_app(), raise_server_exceptions=False)
    client.headers["X-Internal-Token"] = TOKEN
    return client


def completion(content: dict, usage: dict | None) -> httpx.Response:
    body = {"choices": [{"message": {"content": json.dumps(content)}}]}
    if usage is not None:
        body["usage"] = usage
    return httpx.Response(200, json=body)


def extract(memo: str) -> httpx.Response:
    image = BytesIO()
    Image.new("RGB", (16, 16), "white").save(image, "PNG")
    files = [("captures", ("c.png", image.getvalue(), "image/png"))]
    return build_client().post(PLACES, data={"memo": memo}, files=files)


def metrics(caplog) -> list[dict[str, str]]:
    lines = [r.getMessage() for r in caplog.records if r.getMessage().startswith("request_metrics")]
    return [dict(part.split("=", 1) for part in line.split()[1:]) for line in lines]


def only_metric(caplog) -> dict[str, str]:
    found = metrics(caplog)
    assert len(found) == 1, found
    return found[0]


@pytest.fixture(autouse=True)
def capture_info(caplog):
    caplog.set_level(logging.INFO, logger="ai")


@respx.mock
def test_successful_llm_request_records_feature_latency_and_tokens(caplog):
    usage = {"prompt_tokens": 11, "completion_tokens": 7}
    respx.post(GMS_URL).mock(return_value=completion({"items": []}, usage))

    response = build_client().post(CHECKLIST, json=BODY, headers={"X-Trace-Id": TRACE_ID})

    assert response.status_code == 200
    metric = only_metric(caplog)
    assert int(metric.pop("elapsed_ms")) >= 0
    assert metric == {
        "feature": "checklist-suggestions",
        "status": "200",
        "outcome": "success",
        "trace_id": TRACE_ID,
        "llm_calls": "1",
        "prompt_tokens": "11",
        "completion_tokens": "7",
        "provider_failures": "0",
    }


@respx.mock
def test_llm_failure_with_rule_fallback_is_degraded(caplog):
    respx.post(GMS_URL).mock(return_value=httpx.Response(500))

    assert build_client().post(CHECKLIST, json=BODY).status_code == 200

    metric = only_metric(caplog)
    assert metric["outcome"] == "degraded"
    assert metric["llm_calls"] == "0"
    assert metric["provider_failures"] == "1"


def test_missing_llm_key_counts_as_provider_failure(caplog):
    build_client(build_app(gms_api_key="")).post(CHECKLIST, json=BODY)
    assert only_metric(caplog)["provider_failures"] == "1"


@respx.mock
def test_reply_that_is_not_an_object_counts_as_provider_failure(caplog):
    body = {"choices": [{"message": {"content": "[1]"}}]}
    respx.post(GMS_URL).mock(return_value=httpx.Response(200, json=body))

    build_client().post(CHECKLIST, json=BODY)

    metric = only_metric(caplog)
    assert metric["llm_calls"] == "0"
    assert metric["provider_failures"] == "1"


@respx.mock
@pytest.mark.parametrize(
    "usage",
    [None, {}, {"prompt_tokens": None, "completion_tokens": "many"}],
    ids=["absent", "empty", "bad-values"],
)
def test_unusable_token_counts_are_recorded_as_zero(caplog, usage):
    respx.post(GMS_URL).mock(return_value=completion({"items": []}, usage))

    build_client().post(CHECKLIST, json=BODY)

    metric = only_metric(caplog)
    assert metric["llm_calls"] == "1"
    assert metric["prompt_tokens"] == "0"
    assert metric["completion_tokens"] == "0"


@respx.mock
def test_provider_outage_that_fails_the_request_is_a_failure(caplog):
    respx.post(GMS_URL).mock(return_value=httpx.Response(500))

    response = extract("해운대 가자")

    assert response.status_code == 503
    metric = only_metric(caplog)
    assert metric["feature"] == "place-extractions"
    assert metric["outcome"] == "failure"


def test_invalid_request_is_a_client_error(caplog):
    assert build_client().post(CHECKLIST, json={}).status_code == 400
    metric = only_metric(caplog)
    assert metric["feature"] == "checklist-suggestions"
    assert metric["outcome"] == "client_error"


def test_unknown_path_is_not_logged_as_a_feature(caplog):
    assert build_client().get("/ai/v1/secret%20path").status_code == 404
    metric = only_metric(caplog)
    assert metric["feature"] == "unmatched"
    assert "secret" not in caplog.text


def test_unhandled_error_is_still_recorded(caplog):
    app = build_app()

    @app.get("/ai/v1/boom")
    async def boom():
        raise RuntimeError("터짐")

    assert build_client(app).get("/ai/v1/boom").status_code == 500
    metric = only_metric(caplog)
    assert metric["feature"] == "boom"
    assert metric["status"] == "500"
    assert metric["outcome"] == "failure"


def test_over_budget_request_is_a_failure(caplog):
    app = build_app(request_budget_seconds=0.05)

    @app.get("/ai/v1/slow")
    async def slow():
        await asyncio.sleep(5)

    assert build_client(app).get("/ai/v1/slow").status_code == 503
    assert only_metric(caplog)["outcome"] == "failure"


async def test_concurrent_requests_do_not_share_counts(caplog):
    app = build_app()

    @app.get("/ai/v1/tokens/{amount}")
    async def tokens(amount: int):
        record_llm_call(amount, amount)
        await asyncio.sleep(0.02)
        record_llm_call(amount, amount)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        await asyncio.gather(http.get("/ai/v1/tokens/3"), http.get("/ai/v1/tokens/5"))

    assert sorted(metric["prompt_tokens"] for metric in metrics(caplog)) == ["10", "6"]


@respx.mock
def test_logs_do_not_contain_keys_or_user_text(caplog):
    respx.post(GMS_URL).mock(return_value=httpx.Response(500))
    memo = "개인 메모 해운대 비밀 약속"

    extract(memo)

    assert only_metric(caplog)["status"] == "503"
    for secret in (memo, GMS_KEY, TOKEN):
        assert secret not in caplog.text


def test_recording_outside_a_request_does_nothing():
    record_llm_call(1, 1)


@respx.mock
async def test_naver_failures_are_counted():
    respx.get(NAVER_URL).mock(return_value=httpx.Response(500))
    usage = begin_usage()
    async with httpx.AsyncClient() as http:
        naver = NaverLocalClient(http, client_id="i", client_secret="s", timeout_seconds=1)
        with pytest.raises(PlaceSearchUnavailable):
            await naver.search("해운대")
    assert usage.provider_failures == 1


async def test_missing_naver_key_is_counted():
    usage = begin_usage()
    async with httpx.AsyncClient() as http:
        naver = NaverLocalClient(http, client_id="", client_secret="", timeout_seconds=1)
        with pytest.raises(PlaceSearchUnavailable):
            await naver.search("해운대")
    assert usage.provider_failures == 1


@respx.mock
async def test_kakao_failures_are_counted():
    respx.get(CAR_URL).mock(return_value=httpx.Response(500))
    usage = begin_usage()
    async with httpx.AsyncClient() as http:
        kakao = KakaoRoutingClient(http, api_key="k", timeout_seconds=1)
        await kakao.leg(ORIGIN, DESTINATION, TransportMode.CAR)
    assert usage.provider_failures == 1


async def test_missing_kakao_key_is_counted():
    usage = begin_usage()
    async with httpx.AsyncClient() as http:
        kakao = KakaoRoutingClient(http, api_key="", timeout_seconds=1)
        await kakao.leg(ORIGIN, DESTINATION, TransportMode.CAR)
    assert usage.provider_failures == 1
