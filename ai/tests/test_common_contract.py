"""공통 계약 (spec §1): 성공·오류 형식, 추적 ID, 내부 토큰."""

import pytest
from fastapi import APIRouter, Depends
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.schemas import ApiError, CamelModel, Data
from app.core.security import require_internal_token
from app.main import create_app

TOKEN = "secret-token"


class Echo(CamelModel):
    trip_name: str


def build_client(token: str = "") -> TestClient:
    app = create_app(
        Settings(_env_file=None, internal_api_token=token, allow_no_internal_token=not token)
    )
    router = APIRouter(prefix="/ai/v1", dependencies=[Depends(require_internal_token)])

    @router.post("/echo")
    def echo(body: Echo) -> Data[Echo]:
        return Data(data=body)

    @router.get("/insufficient")
    def insufficient():
        raise ApiError(422, "INSUFFICIENT_DATA", "장소가 부족합니다.")

    @router.get("/boom")
    def boom():
        raise RuntimeError("비밀 내용")

    app.include_router(router)
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def client() -> TestClient:
    return build_client()


def error_of(resp, status: int, code: str) -> dict:
    assert resp.status_code == status, resp.text
    err = resp.json()["error"]
    assert err["code"] == code
    assert set(err) == {"code", "message", "fields", "traceId"}
    assert resp.headers["x-trace-id"] == err["traceId"]
    return err


def test_health_returns_data_envelope_without_token():
    resp = build_client(TOKEN).get("/ai/v1/health")
    assert resp.status_code == 200
    assert resp.json() == {"data": {"status": "ok"}}


def test_camel_case_in_and_out(client):
    resp = client.post("/ai/v1/echo", json={"tripName": "부산"})
    assert resp.json() == {"data": {"tripName": "부산"}}


def test_validation_error_fields_match_backend_shape(client):
    err = error_of(client.post("/ai/v1/echo", json={}), 400, "VALIDATION_ERROR")
    assert [f["field"] for f in err["fields"]] == ["tripName"]
    assert set(err["fields"][0]) == {"field", "message"}


def test_api_error_keeps_code_and_message(client):
    err = error_of(client.get("/ai/v1/insufficient"), 422, "INSUFFICIENT_DATA")
    assert err["message"] == "장소가 부족합니다."
    assert err["fields"] == []


def test_unknown_path_is_not_found(client):
    error_of(client.get("/ai/v1/none"), 404, "NOT_FOUND")


def test_wrong_method_is_method_not_allowed(client):
    resp = client.get("/ai/v1/echo")
    error_of(resp, 405, "METHOD_NOT_ALLOWED")
    assert resp.headers["allow"] == "POST"


def test_unexpected_error_hides_detail(client):
    resp = client.get("/ai/v1/boom", headers={"X-Trace-Id": "job-1"})
    err = error_of(resp, 500, "INTERNAL_ERROR")
    assert "비밀" not in resp.text
    assert err["traceId"] == "job-1"


def test_trace_id_from_request_is_returned(client):
    resp = client.get(
        "/ai/v1/health", headers={"X-Trace-Id": "0193f2a0-7c1d-7000-8000-000000000001"}
    )
    assert resp.headers["x-trace-id"] == "0193f2a0-7c1d-7000-8000-000000000001"


def test_trace_id_is_generated_when_missing(client):
    assert client.get("/ai/v1/health").headers["x-trace-id"]


def test_malformed_trace_id_is_replaced(client):
    bad = "x" * 65
    assert client.get("/ai/v1/health", headers={"X-Trace-Id": bad}).headers["x-trace-id"] != bad


def test_missing_token_is_rejected():
    error_of(build_client(TOKEN).get("/ai/v1/insufficient"), 401, "UNAUTHENTICATED")


def test_wrong_token_is_rejected():
    resp = build_client(TOKEN).get("/ai/v1/insufficient", headers={"X-Internal-Token": "wrong"})
    error_of(resp, 401, "UNAUTHENTICATED")


def test_non_ascii_token_is_rejected_not_crashed():
    headers = {"X-Internal-Token": "토큰".encode()}
    error_of(
        build_client(TOKEN).get("/ai/v1/insufficient", headers=headers), 401, "UNAUTHENTICATED"
    )


def test_correct_token_passes():
    resp = build_client(TOKEN).get("/ai/v1/insufficient", headers={"X-Internal-Token": TOKEN})
    assert resp.status_code == 422


def test_empty_token_setting_skips_check(client):
    assert client.get("/ai/v1/insufficient").status_code == 422
