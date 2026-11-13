"""GMS 받아쓰기 클라이언트: 요청 모양, 무음 구간 제거, 장애 구분 (spec §14)."""

import httpx
import pytest
import respx

from app.clients.stt import GmsTranscriber, SttUnavailable

BASE_URL = "https://gms.test/v1"
URL = f"{BASE_URL}/audio/transcriptions"
KEY = "gms-secret-key"


def verbose(text: str, segments: list[tuple], duration: float = 3.0) -> dict:
    """segments: (글, no_speech_prob[, avg_logprob])"""
    return {
        "text": text,
        "duration": duration,
        "language": "korean",
        "segments": [
            {
                "text": seg[0],
                "no_speech_prob": seg[1],
                "avg_logprob": seg[2] if len(seg) > 2 else -0.3,
            }
            for seg in segments
        ],
    }


@pytest.fixture
async def stt():
    async with httpx.AsyncClient() as http:
        yield GmsTranscriber(
            http, api_key=KEY, base_url=BASE_URL, model="whisper-1", timeout_seconds=1
        )


@respx.mock
async def test_sends_audio_as_m4a_with_korean_and_verbose_json(stt):
    route = respx.post(URL).mock(
        return_value=httpx.Response(200, json=verbose("택시 2만 원", [("택시 2만 원", 0.01)]))
    )

    result = await stt.transcribe(b"audio-bytes", hints=["민수", "지연"])

    request = route.calls.last.request
    body = request.content
    assert request.headers["Authorization"] == f"Bearer {KEY}"
    assert b'name="model"\r\n\r\nwhisper-1' in body
    assert b'name="language"\r\n\r\nko' in body
    assert b'name="response_format"\r\n\r\nverbose_json' in body
    assert b'filename="recording.m4a"' in body
    assert b"Content-Type: audio/mp4" in body
    assert b"audio-bytes" in body
    assert "민수, 지연".encode() in body
    assert result.text == "택시 2만 원"
    assert result.duration_seconds == 3.0


@respx.mock
async def test_without_hints_sends_no_prompt(stt):
    # 힌트 문장은 무음에서 그대로 받아써지는 일이 있어 없으면 보내지 않는다
    route = respx.post(URL).mock(
        return_value=httpx.Response(200, json=verbose("커피", [("커피", 0.01)]))
    )

    await stt.transcribe(b"audio", hints=[])

    assert b'name="prompt"' not in route.calls.last.request.content


@respx.mock
async def test_drops_segments_that_whisper_marks_as_no_speech(stt):
    # 무음에서 whisper는 '고맙습니다.' 같은 문장을 지어낸다. 실측 no_speech_prob 0.94
    respx.post(URL).mock(
        return_value=httpx.Response(
            200,
            json=verbose(
                "택시 2만 원 고맙습니다.", [("택시 2만 원", 0.02), (" 고맙습니다.", 0.94)]
            ),
        )
    )

    result = await stt.transcribe(b"audio", hints=[])

    assert result.text == "택시 2만 원"


@respx.mock
async def test_unsure_but_confidently_read_speech_is_kept(stt):
    # 실측: 끝 문장이 no_speech_prob 0.72였지만 글은 바르게 읽혔다(avg_logprob -0.49)
    respx.post(URL).mock(
        return_value=httpx.Response(
            200,
            json=verbose(
                "숙소 24만원 내가 냈어 전부 우리 셋이 똑같이 나눠",
                [
                    ("숙소 24만원 내가 냈어", 0.1, -0.16),
                    (" 전부 우리 셋이 똑같이 나눠", 0.72, -0.49),
                ],
            ),
        )
    )

    result = await stt.transcribe(b"audio", hints=[])

    assert result.text == "숙소 24만원 내가 냈어 전부 우리 셋이 똑같이 나눠"


@respx.mock
async def test_unsure_and_poorly_read_segment_is_dropped(stt):
    respx.post(URL).mock(
        return_value=httpx.Response(
            200, json=verbose("커피 만원 음", [("커피 만원", 0.02), (" 음 그", 0.8, -0.9)])
        )
    )

    assert (await stt.transcribe(b"audio", hints=[])).text == "커피 만원"


@respx.mock
async def test_only_silence_gives_empty_text(stt):
    respx.post(URL).mock(
        return_value=httpx.Response(200, json=verbose("고맙습니다.", [("고맙습니다.", 0.94)]))
    )

    assert (await stt.transcribe(b"audio", hints=[])).text == ""


@respx.mock
async def test_response_without_segments_uses_text(stt):
    respx.post(URL).mock(return_value=httpx.Response(200, json={"text": " 커피 만 원 "}))

    result = await stt.transcribe(b"audio", hints=[])

    assert result.text == "커피 만 원"
    assert result.duration_seconds is None


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500),
        httpx.Response(400, json={"message": "Model is not available"}),
        httpx.Response(200, text="not json"),
        httpx.Response(200, json={"segments": []}),
        httpx.Response(200, json=[1, 2]),
    ],
    ids=["500", "400", "not-json", "no-text", "not-object"],
)
@respx.mock
async def test_bad_responses_raise_unavailable(stt, response):
    respx.post(URL).mock(return_value=response)

    with pytest.raises(SttUnavailable):
        await stt.transcribe(b"audio", hints=[])


@respx.mock
async def test_timeout_raises_unavailable_without_retry(stt):
    route = respx.post(URL).mock(side_effect=httpx.ReadTimeout("slow"))

    with pytest.raises(SttUnavailable):
        await stt.transcribe(b"audio", hints=[])

    assert route.call_count == 1


@respx.mock
async def test_missing_key_raises_unavailable_without_calling():
    route = respx.post(URL)
    async with httpx.AsyncClient() as http:
        stt = GmsTranscriber(http, api_key="", base_url=BASE_URL, model="m", timeout_seconds=1)

        with pytest.raises(SttUnavailable):
            await stt.transcribe(b"audio", hints=[])

    assert not route.called


@respx.mock
async def test_logs_never_contain_key_or_speech(stt, caplog):
    caplog.set_level("INFO")
    respx.post(URL).mock(
        return_value=httpx.Response(200, json=verbose("비밀 이야기", [("비밀 이야기", 0.01)]))
    )
    await stt.transcribe(b"audio", hints=["민수"])
    respx.post(URL).mock(side_effect=httpx.ConnectError(f"failed {KEY}"))
    with pytest.raises(SttUnavailable) as raised:
        await stt.transcribe(b"audio", hints=[])

    assert "stt_call" in caplog.text
    assert KEY not in caplog.text + str(raised.value)
    assert "비밀 이야기" not in caplog.text
    assert "민수" not in caplog.text
