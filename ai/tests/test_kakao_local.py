"""카카오 로컬 키워드 검색: 좌표·주소는 공급자 값만 쓴다 (spec §4)."""

import httpx
import pytest
import respx

from app.clients.kakao_local import KakaoLocalClient, PlaceSearchUnavailable

URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
KEY = "kakao-secret-key"

DOCUMENT = {
    "id": "26338954",
    "place_name": "흰여울문화마을",
    "road_address_name": "부산 영도구 흰여울길 1",
    "address_name": "부산 영도구 영선동4가 1",
    "x": "129.045",
    "y": "35.078",
    "category_name": "여행 > 관광,명소",
}


@pytest.fixture
async def kakao():
    async with httpx.AsyncClient() as http:
        yield KakaoLocalClient(http, api_key=KEY, timeout_seconds=1)


@respx.mock
async def test_maps_document_to_spec_place_shape(kakao):
    respx.get(URL).mock(return_value=httpx.Response(200, json={"documents": [DOCUMENT]}))

    [place] = await kakao.search("흰여울문화마을")

    assert place.model_dump(by_alias=True) == {
        "name": "흰여울문화마을",
        "address": "부산 영도구 흰여울길 1",
        "latitude": 35.078,
        "longitude": 129.045,
        "provider": "KAKAO",
        "providerPlaceId": "26338954",
        "category": "여행 > 관광,명소",
    }


@respx.mock
async def test_sends_query_size_and_key(kakao):
    route = respx.get(URL).mock(return_value=httpx.Response(200, json={"documents": []}))

    await kakao.search("해운대", size=5)

    request = route.calls.last.request
    assert request.url.params["query"] == "해운대"
    assert request.url.params["size"] == "5"
    assert request.headers["Authorization"] == f"KakaoAK {KEY}"


@respx.mock
async def test_falls_back_to_lot_address_and_blank_values_become_none(kakao):
    document = {**DOCUMENT, "road_address_name": "", "category_name": ""}
    respx.get(URL).mock(return_value=httpx.Response(200, json={"documents": [document]}))

    [place] = await kakao.search("흰여울")

    assert place.address == "부산 영도구 영선동4가 1"
    assert place.category is None


@respx.mock
async def test_no_results_is_empty_not_failure(kakao):
    respx.get(URL).mock(return_value=httpx.Response(200, json={"documents": []}))

    assert await kakao.search("없는 장소") == []


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500),
        httpx.Response(401),
        httpx.Response(200, text="not json"),
        httpx.Response(200, json={"meta": {}}),
        httpx.Response(200, json={"documents": [{"id": "1"}]}),
        httpx.Response(200, json={"documents": [{**DOCUMENT, "y": "north"}]}),
    ],
    ids=["500", "401", "body-not-json", "no-documents", "missing-fields", "bad-coordinate"],
)
@respx.mock
async def test_bad_responses_raise_unavailable(kakao, response):
    respx.get(URL).mock(return_value=response)

    with pytest.raises(PlaceSearchUnavailable):
        await kakao.search("해운대")


@respx.mock
async def test_timeout_raises_unavailable(kakao):
    respx.get(URL).mock(side_effect=httpx.ConnectTimeout("slow"))

    with pytest.raises(PlaceSearchUnavailable):
        await kakao.search("해운대")


@respx.mock
async def test_missing_key_raises_unavailable_without_calling():
    route = respx.get(URL)
    async with httpx.AsyncClient() as http:
        kakao = KakaoLocalClient(http, api_key="", timeout_seconds=1)

        with pytest.raises(PlaceSearchUnavailable):
            await kakao.search("해운대")

    assert not route.called
