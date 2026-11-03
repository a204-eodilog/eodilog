"""GMS 클라이언트: 응답 해석과 장애 구분 (spec §10)."""

import base64
import json

import httpx
import pytest
import respx

from app.clients.gms import GmsClient, LLMUnavailable

BASE_URL = "https://gms.test/v1"
URL = f"{BASE_URL}/chat/completions"
KEY = "gms-secret-key"


def completion(content: str | None) -> dict:
    return {"choices": [{"message": {"content": content}}], "usage": {"prompt_tokens": 1}}


@pytest.fixture
async def gms():
    async with httpx.AsyncClient() as http:
        yield GmsClient(
            http, api_key=KEY, base_url=BASE_URL, model="gpt-5.6-luna", timeout_seconds=1
        )


@respx.mock
async def test_returns_parsed_json_object(gms):
    respx.post(URL).mock(return_value=httpx.Response(200, json=completion('{"places": []}')))

    assert await gms.chat_json("system", "user") == {"places": []}


@respx.mock
async def test_request_asks_json_and_never_sends_temperature(gms):
    route = respx.post(URL).mock(return_value=httpx.Response(200, json=completion("{}")))

    await gms.chat_json("system", "user")

    request = route.calls.last.request
    body = json.loads(request.content)
    assert request.headers["Authorization"] == f"Bearer {KEY}"
    assert body["model"] == "gpt-5.6-luna"
    assert body["response_format"] == {"type": "json_object"}
    assert body["messages"] == [
        {"role": "system", "content": "system"},
        {"role": "user", "content": "user"},
    ]
    # gpt-5.6-luna는 temperature를 보내면 400을 돌려준다
    assert "temperature" not in body


@respx.mock
async def test_images_are_sent_as_jpeg_data_urls(gms):
    route = respx.post(URL).mock(return_value=httpx.Response(200, json=completion("{}")))

    await gms.chat_json("system", "user", images_jpeg=[b"jpeg-bytes"])

    content = json.loads(route.calls.last.request.content)["messages"][1]["content"]
    encoded = base64.b64encode(b"jpeg-bytes").decode()
    assert content == [
        {"type": "text", "text": "user"},
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{encoded}"}},
    ]


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500),
        httpx.Response(429),
        httpx.Response(200, text="not json"),
        httpx.Response(200, json={"choices": []}),
        httpx.Response(200, json=completion(None)),
        httpx.Response(200, json=completion("not json")),
        httpx.Response(200, json=completion("[1, 2]")),
    ],
    ids=[
        "500",
        "429",
        "body-not-json",
        "no-choices",
        "no-content",
        "content-not-json",
        "not-object",
    ],
)
@respx.mock
async def test_bad_responses_raise_unavailable(gms, response):
    respx.post(URL).mock(return_value=response)

    with pytest.raises(LLMUnavailable):
        await gms.chat_json("system", "user")


@respx.mock
async def test_timeout_raises_unavailable_without_retry(gms):
    # 재시도는 백엔드 jobs가 맡는다. 여기서 또 재시도하면 45초 예산을 넘길 수 있다
    route = respx.post(URL).mock(side_effect=httpx.ReadTimeout("slow"))

    with pytest.raises(LLMUnavailable):
        await gms.chat_json("system", "user")

    assert route.call_count == 1


@respx.mock
async def test_missing_key_raises_unavailable_without_calling():
    route = respx.post(URL)
    async with httpx.AsyncClient() as http:
        gms = GmsClient(http, api_key="", base_url=BASE_URL, model="m", timeout_seconds=1)

        with pytest.raises(LLMUnavailable):
            await gms.chat_json("system", "user")

    assert not route.called


@respx.mock
async def test_failure_does_not_expose_key_or_content(gms, caplog):
    respx.post(URL).mock(side_effect=httpx.ConnectError(f"failed {KEY}"))

    with pytest.raises(LLMUnavailable) as raised:
        await gms.chat_json("system", "개인 메모")

    assert KEY not in str(raised.value)
    assert KEY not in caplog.text
    assert "개인 메모" not in caplog.text
