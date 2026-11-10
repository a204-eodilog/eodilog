"""요청 하나의 LLM 사용량과 공급자 실패 수. 요청 끝에 지표 로그 한 줄로 남긴다."""

from contextvars import ContextVar
from dataclasses import dataclass


@dataclass
class RequestUsage:
    llm_calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    provider_failures: int = 0


_usage: ContextVar[RequestUsage | None] = ContextVar("request_usage", default=None)


def begin_usage() -> RequestUsage:
    usage = RequestUsage()
    _usage.set(usage)
    return usage


def record_llm_call(prompt_tokens: object, completion_tokens: object) -> None:
    """성공한 호출만 센다. 공급자가 토큰 수를 주지 않으면 0으로 둔다."""
    usage = _usage.get()
    if usage is None:
        return
    usage.llm_calls += 1
    usage.prompt_tokens += _count(prompt_tokens)
    usage.completion_tokens += _count(completion_tokens)


def record_provider_failure() -> None:
    usage = _usage.get()
    if usage is not None:
        usage.provider_failures += 1


def _count(value: object) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) else 0
