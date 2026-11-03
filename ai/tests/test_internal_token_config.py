"""내부 토큰 없이는 서버가 뜨지 않는다. 로컬 개발만 명시적으로 허용한다 (spec §1)."""

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

SECRET = "real-secret-token"
PROTECTED = "/ai/v1/place-extractions"


def start(settings: Settings) -> None:
    """lifespan까지 실제로 돌린다. `with` 없는 TestClient는 시작 단계를 건너뛴다."""
    with TestClient(create_app(settings)):
        pass


def post(app, **headers):
    return TestClient(app, raise_server_exceptions=False).post(
        PROTECTED, data={"memo": "x"}, headers=headers
    )


@pytest.mark.parametrize("token", ["", "   ", "\n"], ids=["empty", "spaces", "newline"])
def test_server_does_not_start_without_token(token):
    with pytest.raises(RuntimeError, match="INTERNAL_API_TOKEN"):
        start(Settings(_env_file=None, internal_api_token=token))


def test_missing_setting_counts_as_no_token(monkeypatch):
    monkeypatch.delenv("INTERNAL_API_TOKEN", raising=False)
    monkeypatch.delenv("ALLOW_NO_INTERNAL_TOKEN", raising=False)
    with pytest.raises(RuntimeError, match="INTERNAL_API_TOKEN"):
        start(Settings(_env_file=None))


def test_startup_error_explains_the_local_option():
    with pytest.raises(RuntimeError, match="ALLOW_NO_INTERNAL_TOKEN"):
        start(Settings(_env_file=None))


def test_server_starts_with_token_and_enforces_it():
    settings = Settings(_env_file=None, internal_api_token=SECRET)
    start(settings)
    app = create_app(settings)
    assert post(app).status_code == 401
    assert post(app, **{"X-Internal-Token": "wrong"}).status_code == 401
    assert post(app, **{"X-Internal-Token": SECRET}).status_code != 401


def test_local_option_allows_requests_without_token():
    settings = Settings(_env_file=None, allow_no_internal_token=True)
    start(settings)
    assert post(create_app(settings)).status_code != 401


def test_local_option_does_not_disable_a_configured_token():
    settings = Settings(_env_file=None, internal_api_token=SECRET, allow_no_internal_token=True)
    assert post(create_app(settings)).status_code == 401


@pytest.mark.parametrize("token", ["", "   "], ids=["empty", "spaces"])
def test_requests_are_rejected_even_if_startup_check_was_skipped(token):
    app = create_app(Settings(_env_file=None, internal_api_token=token))
    assert post(app).status_code == 401
    assert post(app, **{"X-Internal-Token": token}).status_code == 401


def test_local_option_reads_from_environment(monkeypatch):
    monkeypatch.setenv("ALLOW_NO_INTERNAL_TOKEN", "true")
    monkeypatch.delenv("INTERNAL_API_TOKEN", raising=False)
    start(Settings(_env_file=None))


def test_health_stays_open_for_deployment_checks():
    app = create_app(Settings(_env_file=None, internal_api_token=SECRET))
    assert TestClient(app).get("/ai/v1/health").status_code == 200
