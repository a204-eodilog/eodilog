"""요청 시간 예산 (spec §1.0): 45초 안에 끝내거나 503을 돌려준다."""

import asyncio
import time

import httpx
from fastapi.testclient import TestClient

from app.clients.errors import ProviderUnavailable
from app.core.config import Settings
from app.main import create_app


def build_client(budget: float = 0.05) -> TestClient:
    app = create_app(
        Settings(_env_file=None, request_budget_seconds=budget, allow_no_internal_token=True)
    )

    @app.get("/slow")
    async def slow():
        await asyncio.sleep(5)

    @app.get("/slow-cpu")
    async def slow_cpu():
        await asyncio.to_thread(time.sleep, 1)

    @app.get("/fast")
    async def fast():
        return {"data": {}}

    @app.get("/own-timeout")
    async def own_timeout():
        raise TimeoutError("예산과 무관한 내부 오류")

    @app.get("/provider-down")
    async def provider_down():
        raise ProviderUnavailable("비밀 내용")

    return TestClient(app, raise_server_exceptions=False)


def test_default_budget_is_45_seconds():
    assert Settings(_env_file=None).request_budget_seconds == 45


def test_over_budget_returns_503_in_common_format():
    started = time.perf_counter()

    response = build_client().get("/slow", headers={"X-Trace-Id": "job-1"})

    assert time.perf_counter() - started < 2
    assert response.status_code == 503
    assert response.headers["X-Trace-Id"] == "job-1"
    error = response.json()["error"]
    assert error["code"] == "PROVIDER_UNAVAILABLE"
    assert error["fields"] == []
    assert error["traceId"] == "job-1"


async def test_over_budget_thread_work_returns_503_without_waiting_for_thread():
    # TestClient는 끝날 때 이벤트 루프가 스레드를 기다려서 실제 응답 시간을 잴 수 없다
    transport = httpx.ASGITransport(app=build_client().app)
    started = time.perf_counter()

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/slow-cpu")

    assert time.perf_counter() - started < 0.8
    assert response.status_code == 503


def test_within_budget_passes_through():
    assert build_client(budget=5).get("/fast").status_code == 200


def test_timeout_error_inside_endpoint_stays_500():
    # 예산 초과가 아니므로 503으로 재시도시키면 안 된다
    response = build_client(budget=5).get("/own-timeout")

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"


def test_provider_failure_returns_503_without_detail():
    response = build_client(budget=5).get("/provider-down", headers={"X-Trace-Id": "job-2"})

    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "PROVIDER_UNAVAILABLE"
    assert error["traceId"] == "job-2"
    assert "비밀 내용" not in response.text
