"""GMS(OpenAI 호환) 받아쓰기 클라이언트.

2026-11-12 실제 호출로 확인: GMS는 `/audio/transcriptions`에서 `whisper-1`만 열려 있다
(gpt-4o-transcribe·gpt-4o-mini-transcribe는 400 "not available"). M4A(AAC)를 그대로 받는다.
"""

import logging
import re
import time
from dataclasses import dataclass

import httpx

from app.clients.errors import ProviderUnavailable
from app.core.metrics import record_provider_failure

log = logging.getLogger("ai")

# whisper가 무음에서 지어내는 구간을 뺀다. 무음 확률이 높고, 글을 자신 없게 읽었거나 무음에서
# 흔히 지어내는 인사말일 때만 뺀다. 실측: 무음 '고맙습니다.' 0.94 / -0.79,
# 실제 말 '전부 우리 셋이 똑같이 나눠' 0.72 / -0.49 (무음 확률만 보면 실제 말이 빠진다)
NO_SPEECH_PROBABILITY = 0.6
LOW_AVG_LOGPROB = -0.7
SILENCE_PHRASES = {
    "고맙습니다",
    "감사합니다",
    "시청해주셔서감사합니다",
    "구독과좋아요부탁드립니다",
}
MAX_HINT_CHARS = 200


class SttUnavailable(ProviderUnavailable):
    pass


@dataclass(frozen=True)
class Transcription:
    text: str
    # 공급자가 실제로 읽은 길이. 주지 않으면 None
    duration_seconds: float | None


class GmsTranscriber:
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
        self._url = f"{base_url.rstrip('/')}/audio/transcriptions"
        self._model = model
        self._timeout = timeout_seconds

    async def transcribe(self, audio: bytes, *, hints: list[str]) -> Transcription:
        """M4A 한 개를 한국어로 받아쓴다. 재시도하지 않는다(원음을 남기지 않는 정책)."""
        if not self._key:
            record_provider_failure()
            raise SttUnavailable("GMS 키가 설정되지 않았습니다.")

        form = {"model": self._model, "language": "ko", "response_format": "verbose_json"}
        # 힌트 문장은 무음에서 그대로 받아써지는 일이 있어 이름이 있을 때만 보낸다
        if hints:
            form["prompt"] = ", ".join(hints)[:MAX_HINT_CHARS]
        started = time.perf_counter()
        try:
            response = await self._http.post(
                self._url,
                data=form,
                files={"file": ("recording.m4a", audio, "audio/mp4")},
                headers={"Authorization": f"Bearer {self._key}"},
                timeout=self._timeout,
            )
            response.raise_for_status()
            result = _parse(response.json())
        except (httpx.HTTPError, KeyError, TypeError, ValueError, AttributeError) as e:
            # 예외 메시지에 응답 내용이 섞일 수 있어 종류만 남긴다
            record_provider_failure()
            log.warning("stt_call_failed model=%s error=%s", self._model, type(e).__name__)
            raise SttUnavailable("음성 인식 호출에 실패했습니다.") from e

        log.info(
            "stt_call model=%s elapsed_ms=%d audio_seconds=%s chars=%d",
            self._model,
            (time.perf_counter() - started) * 1000,
            result.duration_seconds,
            len(result.text),
        )
        return result


def _parse(body: object) -> Transcription:
    if not isinstance(body, dict) or not isinstance(body.get("text"), str):
        raise ValueError("text가 없습니다.")
    duration = body.get("duration")
    duration = float(duration) if isinstance(duration, int | float) else None
    segments = body.get("segments")
    if not isinstance(segments, list) or not segments:
        return Transcription(body["text"].strip(), duration)
    spoken = [
        segment["text"].strip()
        for segment in segments
        if isinstance(segment, dict)
        and isinstance(segment.get("text"), str)
        and not _silence(segment)
    ]
    return Transcription(" ".join(part for part in spoken if part), duration)


def _silence(segment: dict) -> bool:
    if float(segment.get("no_speech_prob") or 0) < NO_SPEECH_PROBABILITY:
        return False
    phrase = re.sub(r"[\s.!?,]", "", segment["text"])
    return float(segment.get("avg_logprob") or 0) < LOW_AVG_LOGPROB or phrase in SILENCE_PHRASES
