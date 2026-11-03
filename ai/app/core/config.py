from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # 비어 있으면 서버 간 인증을 검사하지 않는다 (로컬 개발)
    internal_api_token: str = ""

    gms_api_key: str = ""
    gms_base_url: str = "https://llm-gateway.example.com/api.openai.com/v1"
    llm_model: str = "gpt-5.6-luna"
    kakao_rest_api_key: str = ""

    # 요청 하나의 상한. 백엔드 호출 타임아웃 50초, worker 제한 60초보다 먼저 끝난다 (spec §1.0)
    request_budget_seconds: float = 45
    llm_timeout_seconds: float = 30
    kakao_timeout_seconds: float = 5
    link_timeout_seconds: float = 5


@lru_cache
def get_settings() -> Settings:
    return Settings()
