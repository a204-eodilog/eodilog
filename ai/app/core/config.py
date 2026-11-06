from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # 백엔드와 공유하는 서버 간 인증 토큰. 없으면 서버가 시작되지 않는다
    internal_api_token: str = ""
    # 로컬 개발 전용. 토큰이 없어도 시작하고 검사를 건너뛴다. 운영에서는 켜지 않는다
    allow_no_internal_token: bool = False

    gms_api_key: str = ""
    gms_base_url: str = "https://llm-gateway.example.com/api.openai.com/v1"
    llm_model: str = "gpt-5.6-luna"
    naver_client_id: str = ""
    naver_client_secret: str = ""
    kakao_rest_api_key: str = ""

    # 사진 모델(open_clip). 기준값은 모델마다 달라 모델을 바꾸면 함께 다시 잡는다 (spec AS-7, AS-8)
    clip_model: str = "ViT-B-32-SigLIP2-256"
    clip_pretrained: str = "webli"
    photo_similarity_threshold: float = 0.94
    # 켜면 서버 시작 때 모델을 올려 첫 요청이 느려지지 않는다. Docker 이미지는 켠다
    photo_model_preload: bool = False

    # 요청 하나의 상한. 백엔드 호출 타임아웃 50초, worker 제한 60초보다 먼저 끝난다 (spec §1.0)
    request_budget_seconds: float = 45
    llm_timeout_seconds: float = 30
    place_search_timeout_seconds: float = 5
    kakao_timeout_seconds: float = 5
    link_timeout_seconds: float = 5


@lru_cache
def get_settings() -> Settings:
    return Settings()
