"""네이버 지역 검색: 좌표·주소는 공급자 값만 쓴다 (spec §2, AS-12)."""

import httpx
import pytest
import respx

from app.clients.naver_local import (
    NaverLocalClient,
    PlaceSearchUnavailable,
    provider_place_id,
)

URL = "https://naverapihub.apigw.ntruss.com/search/v1/local"
CLIENT_ID = "naver-client-id"
CLIENT_SECRET = "naver-client-secret"

ITEM = {
    "title": "흰여울문화마을",
    "link": "https://example.test/place",
    "category": "여행,명소>문화마을",
    "description": "",
    "telephone": "",
    "address": "부산광역시 영도구 영선동4가 1",
    "roadAddress": "부산광역시 영도구 흰여울길 1",
    "mapx": "1290450000",
    "mapy": "350780000",
}


def found(*items: dict) -> httpx.Response:
    return httpx.Response(200, json={"total": len(items), "items": list(items)})


@pytest.fixture
async def naver():
    async with httpx.AsyncClient() as http:
        yield NaverLocalClient(
            http, client_id=CLIENT_ID, client_secret=CLIENT_SECRET, timeout_seconds=1
        )


@respx.mock
async def test_maps_item_to_spec_place_shape(naver):
    respx.get(URL).mock(return_value=found(ITEM))

    [place] = await naver.search("흰여울문화마을")

    assert place.model_dump(by_alias=True) == {
        "name": "흰여울문화마을",
        "address": "부산광역시 영도구 흰여울길 1",
        "latitude": 35.078,
        "longitude": 129.045,
        "provider": "NAVER",
        "providerPlaceId": provider_place_id("흰여울문화마을", "부산광역시 영도구 흰여울길 1"),
        "category": "여행,명소>문화마을",
    }


@respx.mock
async def test_sends_query_display_and_both_credentials(naver):
    route = respx.get(URL).mock(return_value=found())

    await naver.search("해운대", size=5)

    request = route.calls.last.request
    assert request.url.params["query"] == "해운대"
    assert request.url.params["display"] == "5"
    assert request.headers["X-NCP-APIGW-API-KEY-ID"] == CLIENT_ID
    assert request.headers["X-NCP-APIGW-API-KEY"] == CLIENT_SECRET


@respx.mock
async def test_display_is_capped_at_the_api_maximum(naver):
    route = respx.get(URL).mock(return_value=found())

    await naver.search("해운대", size=20)

    assert route.calls.last.request.url.params["display"] == "5"


@respx.mock
async def test_name_loses_highlight_tags_and_html_entities(naver):
    respx.get(URL).mock(return_value=found({**ITEM, "title": "<b>맛집</b> &amp; 카페"}))

    [place] = await naver.search("맛집")

    assert place.name == "맛집 & 카페"


@respx.mock
async def test_decimal_coordinates_are_also_read_as_wgs84(naver):
    respx.get(URL).mock(return_value=found({**ITEM, "mapx": "129.045", "mapy": "35.078"}))

    [place] = await naver.search("흰여울")

    assert (place.latitude, place.longitude) == (35.078, 129.045)


@respx.mock
async def test_falls_back_to_lot_address_and_blank_category_becomes_none(naver):
    respx.get(URL).mock(return_value=found({**ITEM, "roadAddress": "", "category": ""}))

    [place] = await naver.search("흰여울")

    assert place.address == "부산광역시 영도구 영선동4가 1"
    assert place.category is None


@respx.mock
async def test_result_without_any_address_is_skipped(naver):
    # 주소가 없으면 안정된 장소 ID를 만들 수 없다
    nameless_address = {**ITEM, "title": "주소없음", "roadAddress": "", "address": ""}
    respx.get(URL).mock(return_value=found(nameless_address, ITEM))

    places = await naver.search("흰여울")

    assert [place.name for place in places] == ["흰여울문화마을"]


@respx.mock
async def test_same_place_returned_twice_is_kept_once(naver):
    respx.get(URL).mock(return_value=found(ITEM, {**ITEM, "title": "<b>흰여울</b>문화마을"}))

    assert len(await naver.search("흰여울")) == 1


@respx.mock
async def test_same_name_at_another_address_is_a_different_place(naver):
    other = {**ITEM, "roadAddress": "부산광역시 영도구 흰여울길 2"}
    respx.get(URL).mock(return_value=found(ITEM, other))

    assert len(await naver.search("흰여울")) == 2


def test_place_id_is_stable_across_spacing_and_case_only():
    same = provider_place_id("Super Coffee 해운대", "부산 해운대구 구남로 1")
    assert same == provider_place_id("super coffee해운대", "부산 해운대구  구남로 1")
    assert same != provider_place_id("Super Coffee 해운대", "부산 해운대구 구남로 2")
    assert same != provider_place_id("Super Coffee 광안", "부산 해운대구 구남로 1")
    assert 0 < len(same) <= 255


def test_place_id_keeps_name_and_address_separate():
    assert provider_place_id("가나", "다라") != provider_place_id("가", "나다라")


@respx.mock
async def test_no_results_is_empty_not_failure(naver):
    respx.get(URL).mock(return_value=found())

    assert await naver.search("없는 장소") == []


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500),
        httpx.Response(401),
        httpx.Response(429),
        httpx.Response(200, text="not json"),
        httpx.Response(200, json={"total": 0}),
        httpx.Response(200, json={"items": [{"title": "이름만"}]}),
        httpx.Response(200, json={"items": [{**ITEM, "mapy": "north"}]}),
        httpx.Response(200, json={"items": [{**ITEM, "mapy": "99999999999"}]}),
        httpx.Response(200, json={"items": [{**ITEM, "mapy": "95.0"}]}),
        httpx.Response(200, json={"items": [{**ITEM, "title": "<b></b>"}]}),
    ],
    ids=[
        "500",
        "401",
        "429",
        "body-not-json",
        "no-items",
        "missing-fields",
        "bad-coordinate",
        "out-of-range-coordinate",
        "latitude-over-90",
        "blank-name",
    ],
)
@respx.mock
async def test_bad_responses_raise_unavailable(naver, response):
    respx.get(URL).mock(return_value=response)

    with pytest.raises(PlaceSearchUnavailable):
        await naver.search("해운대")


@respx.mock
async def test_timeout_raises_unavailable(naver):
    respx.get(URL).mock(side_effect=httpx.ConnectTimeout("slow"))

    with pytest.raises(PlaceSearchUnavailable):
        await naver.search("해운대")


@pytest.mark.parametrize(
    ("client_id", "client_secret"), [("", ""), (CLIENT_ID, ""), ("", CLIENT_SECRET)]
)
@respx.mock
async def test_missing_credentials_raise_unavailable_without_calling(client_id, client_secret):
    route = respx.get(URL)
    async with httpx.AsyncClient() as http:
        naver = NaverLocalClient(
            http, client_id=client_id, client_secret=client_secret, timeout_seconds=1
        )

        with pytest.raises(PlaceSearchUnavailable):
            await naver.search("해운대")

    assert not route.called
