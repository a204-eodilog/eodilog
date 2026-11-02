from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # 비어 있으면 서버 간 인증을 검사하지 않는다 (로컬 개발)
    internal_api_token: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
