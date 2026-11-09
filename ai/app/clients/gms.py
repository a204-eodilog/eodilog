"""GMS(OpenAI 호환) LLM 클라이언트. 모든 호출은 JSON 객체 응답을 요구한다."""

import base64
import json
import logging
from typing import Any

import httpx

from app.clients.errors import ProviderUnavailable
from app.core.metrics import record_llm_call, record_provider_failure

log = logging.getLogger("ai")


class LLMUnavailable(ProviderUnavailable):
    pass


class GmsClient:
    def __init__(
        self,
        http: httpx.AsyncClient,
        *,
        api_key: str,
        base_url: str,
        model: str,
        timeout_seconds: float,
    ):
        self._http = http
        self._key = api_key
        self._url = f"{base_url.rstrip('/')}/chat/completions"
        self._model = model
        self._timeout = timeout_seconds

    async def chat_json(
        self, system: str, user: str, images_jpeg: list[bytes] | None = None
    ) -> dict[str, Any]:
        if not self._key:
            record_provider_failure()
            raise LLMUnavailable("GMS 키가 설정되지 않았습니다.")

        # temperature는 보내지 않는다. gpt-5.6-luna는 값을 넘기면 400을 돌려준다
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": _user_content(user, images_jpeg)},
            ],
            "response_format": {"type": "json_object"},
        }
        try:
            response = await self._http.post(
                self._url,
                json=payload,
                headers={"Authorization": f"Bearer {self._key}"},
                timeout=self._timeout,
            )
            response.raise_for_status()
            body = response.json()
            parsed = json.loads(body["choices"][0]["message"]["content"])
            usage = body.get("usage") or {}
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError, AttributeError) as e:
            # 예외 메시지에 입력 내용이 섞일 수 있어 종류만 남긴다
            record_provider_failure()
            log.warning("llm_call_failed model=%s error=%s", self._model, type(e).__name__)
            raise LLMUnavailable("LLM 호출에 실패했습니다.") from e

        if not isinstance(parsed, dict):
            record_provider_failure()
            log.warning("llm_call_failed model=%s error=NotJsonObject", self._model)
            raise LLMUnavailable("LLM 응답이 JSON 객체가 아닙니다.")
        record_llm_call(usage.get("prompt_tokens"), usage.get("completion_tokens"))
        log.info(
            "llm_call model=%s prompt_tokens=%s completion_tokens=%s",
            self._model,
            usage.get("prompt_tokens"),
            usage.get("completion_tokens"),
        )
        return parsed


def _user_content(user: str, images_jpeg: list[bytes] | None) -> str | list[dict[str, Any]]:
    if not images_jpeg:
        return user
    images = [
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{base64.b64encode(image).decode()}"},
        }
        for image in images_jpeg
    ]
    return [{"type": "text", "text": user}, *images]
