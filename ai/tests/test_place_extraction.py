"""PLACE_EXTRACTION (spec §2, T-01-1 ~ T-01-10). 실제 클라이언트에 HTTP 응답만 고정한다."""

import base64
import io
import json

import httpx
import pytest
import respx
from fastapi.testclient import TestClient
from PIL import Image

from app.clients.gms import GmsClient
from app.clients.naver_local import NaverLocalClient, provider_place_id
from app.clients.page_meta import PageMetaFetcher
from app.core.config import Settings
from app.features.place_extraction.service import (
    PlaceExtractor,
    normalize,
    similarity,
    without_branch,
)
from app.main import create_app

PATH = "/ai/v1/place-extractions"
GMS_URL = "https://gms.test/v1/chat/completions"
NAVER_URL = "https://naverapihub.apigw.ntruss.com/search/v1/local"
LINK = "https://blog.test/post"
LINK_AT_IP = "https://93.184.216.34/post"
PRIVATE_LINK = "https://internal.test/admin"
TOKEN = "secret-token"

PAGE = """<html><head>
<meta property="og:title" content="민락 수변공원 야경 산책">
<meta property="og:description" content="민락 수변공원에서 야경 보고 남천동 베이커리에 갔어요">
</head></html>"""


def png() -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (20, 20), "white").save(out, format="PNG")
    return out.getvalue()


def document(name: str, spot: str = "1") -> dict:
    return {
        "title": name,
        "roadAddress": f"부산 수영구 민락동 {spot}",
        "address": "",
        "mapx": "1291200000",
        "mapy": "351500000",
        "category": "여행,명소>공원",
    }


def spots(data: dict) -> list[str]:
    """document()에 넣은 spot을 주소 끝에서 다시 읽는다."""
    return [c["place"]["address"].rsplit(" ", 1)[1] for c in data["candidates"]]


async def resolver(host: str) -> list[str]:
    return {"blog.test": ["93.184.216.34"], "internal.test": ["10.0.0.5"]}[host]


@pytest.fixture
def client() -> TestClient:
    return make_client()


def make_client(gms_api_key: str = "k") -> TestClient:
    app = create_app(Settings(_env_file=None, internal_api_token=TOKEN))
    http = httpx.AsyncClient()
    app.state.place_extractor = PlaceExtractor(
        llm=GmsClient(
            http, api_key=gms_api_key, base_url="https://gms.test/v1", model="m", timeout_seconds=1
        ),
        places=NaverLocalClient(http, client_id="i", client_secret="k", timeout_seconds=1),
        pages=PageMetaFetcher(http, timeout_seconds=1, resolver=resolver),
    )
    test_client = TestClient(app, raise_server_exceptions=False)
    test_client.headers["X-Internal-Token"] = TOKEN
    return test_client


def post(client: TestClient, captures: list[bytes] | None = None, **form) -> httpx.Response:
    files = [("captures", (f"c{i}.png", c, "image/png")) for i, c in enumerate(captures or [])]
    return client.post(PATH, data=form, files=files or None)


def mock_llm(*mentions: dict) -> respx.Route:
    content = json.dumps({"places": list(mentions)}, ensure_ascii=False)
    return respx.post(GMS_URL).mock(
        return_value=httpx.Response(200, json={"choices": [{"message": {"content": content}}]})
    )


def mock_places(results: dict[str, list[dict]]) -> respx.Route:
    def respond(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"items": results.get(request.url.params["query"], [])})

    return respx.get(NAVER_URL).mock(side_effect=respond)


def mention(name: str, found_in: str = "MEMO", hint: str | None = None) -> dict:
    return {"mention": name, "address_hint": hint, "found_in": found_in}


@respx.mock
def test_T01_1_finds_places_in_link_and_capture_sign(client):
    respx.get(LINK_AT_IP).mock(return_value=httpx.Response(200, html=PAGE))
    mock_llm(mention("민락 수변공원", "LINK_TEXT"), mention("신기산업", "CAPTURE_SIGN"))
    mock_places(
        {"민락 수변공원": [document("민락수변공원", "1")], "신기산업": [document("신기산업", "2")]}
    )

    response = post(client, [png()], url=LINK)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["resultStatus"] == "SUCCESS"
    assert data["candidates"] == [
        {
            "name": "민락 수변공원",
            "place": {
                "name": "민락수변공원",
                "address": "부산 수영구 민락동 1",
                "latitude": 35.15,
                "longitude": 129.12,
                "provider": "NAVER",
                "providerPlaceId": provider_place_id("민락수변공원", "부산 수영구 민락동 1"),
                "category": "여행,명소>공원",
            },
            "evidence": "게시물 글에서 찾았어요",
            "confidence": 1.0,
        },
        {
            "name": "신기산업",
            "place": {
                "name": "신기산업",
                "address": "부산 수영구 민락동 2",
                "latitude": 35.15,
                "longitude": 129.12,
                "provider": "NAVER",
                "providerPlaceId": provider_place_id("신기산업", "부산 수영구 민락동 2"),
                "category": "여행,명소>공원",
            },
            "evidence": "캡처 속 간판에서 찾았어요",
            "confidence": 1.0,
        },
    ]


@respx.mock
def test_T01_2_same_name_branches_are_multiple_candidates(client):
    mock_llm(mention("바다 앞 카페", "CAPTURE_TEXT"))
    mock_places(
        {
            "바다 앞 카페": [
                document("바다 앞 카페 남천점", "1"),
                document("바다 앞 카페 민락점", "2"),
                document("바다 앞 카페 광안점", "3"),
            ]
        }
    )

    data = post(client, [png()]).json()["data"]

    assert data["resultStatus"] == "MULTIPLE_CANDIDATES"
    assert [c["name"] for c in data["candidates"]] == ["바다 앞 카페"] * 3
    assert {c["evidence"] for c in data["candidates"]} == {"캡처 속 글에서 찾았어요"}
    assert all(0 < c["confidence"] < 1 for c in data["candidates"])


@respx.mock
def test_one_exact_match_among_results_is_confirmed(client):
    mock_llm(mention("신기산업", "CAPTURE_SIGN"))
    mock_places({"신기산업": [document("신기산업 2호점", "2"), document("신기 산업", "1")]})

    data = post(client, [png()]).json()["data"]

    assert data["resultStatus"] == "SUCCESS"
    assert spots(data) == ["1"]


@respx.mock
def test_two_exact_matches_are_not_confirmed(client):
    mock_llm(mention("신기산업", "CAPTURE_SIGN"))
    mock_places({"신기산업": [document("신기산업", "1"), document("신기산업", "2")]})

    data = post(client, [png()]).json()["data"]

    assert data["resultStatus"] == "MULTIPLE_CANDIDATES"
    assert len(data["candidates"]) == 2


@respx.mock
def test_similar_but_different_single_result_needs_confirmation(client):
    mock_llm(mention("청사포 카페", "CAPTURE_SIGN"))
    mock_places({"청사포 카페": [document("청사포역", "1")]})

    data = post(client, [png()]).json()["data"]

    assert data["resultStatus"] == "MULTIPLE_CANDIDATES"
    assert data["candidates"][0]["confidence"] < 1


@respx.mock
def test_candidates_are_sorted_by_similarity(client):
    mock_llm(mention("광안리", "CAPTURE_TEXT"))
    mock_places(
        {"광안리": [document("부산 수영구 광안리 먼 곳", "1"), document("광안리 해변", "2")]}
    )

    data = post(client, [png()]).json()["data"]

    assert spots(data) == ["2", "1"]


@respx.mock
def test_no_search_result_gives_null_place_and_multiple_candidates(client):
    mock_llm(mention("신기산업", "CAPTURE_SIGN"))
    mock_places({})

    data = post(client, [png()]).json()["data"]

    assert data == {
        "resultStatus": "MULTIPLE_CANDIDATES",
        "candidates": [
            {
                "name": "신기산업",
                "place": None,
                "evidence": "캡처 속 간판에서 찾았어요",
                "confidence": None,
            }
        ],
    }


@respx.mock
def test_unrelated_search_results_are_dropped_as_not_found(client):
    """2026-11-14 공기계: '대우디오빌플러스 오피스텔'에 이름이 딴판인 오피스텔 셋이 후보로 왔다."""
    mock_llm(mention("대우디오빌플러스 오피스텔", "CAPTURE_TEXT"))
    mock_places(
        {
            "대우디오빌플러스 오피스텔": [
                document("역삼푸르지오시티오피스텔", "1"),
                document("두산베어스텔", "2"),
                document("더갤러리832", "3"),
            ]
        }
    )

    data = post(client, [png()]).json()["data"]

    assert data["resultStatus"] == "MULTIPLE_CANDIDATES"
    assert [c["place"] for c in data["candidates"]] == [None]


@respx.mock
def test_short_mention_contained_in_place_name_is_kept(client):
    """'광안리' 같은 짧은 이름은 점수가 낮아도 장소 이름에 들어 있으면 후보로 둔다."""
    mock_llm(mention("광안리", "CAPTURE_TEXT"))
    mock_places(
        {"광안리": [document("부산 수영구 광안리 먼 곳", "1"), document("엉뚱한 식당", "2")]}
    )

    data = post(client, [png()]).json()["data"]

    assert spots(data) == ["1"]


@respx.mock
def test_prompt_tells_llm_not_to_list_every_label_on_a_map_capture(client):
    """2026-11-14 공기계: 지도 캡처 한 장에서 건물 이름 20개가 나왔다."""
    llm = mock_llm()
    post(client, [png()])
    system = json.loads(llm.calls.last.request.content)["messages"][0]["content"]
    assert "지도" in system and "핀" in system


@respx.mock
def test_map_capture_area_hint_narrows_the_search(client):
    """2026-11-14 공기계: 역삼 지도 캡처에 종로·중구 지점이 후보로 나왔다(이름만으로 전국 검색).
    지시문이 지도에 보이는 동 이름을 address_hint로 채우게 하고, 그 단서로 먼저 찾는다."""
    llm = mock_llm(mention("스타벅스", "CAPTURE_TEXT", hint="역삼동"))
    places = mock_places(
        {
            "역삼동 스타벅스": [document("스타벅스 역삼점", "1")],
            "스타벅스": [document("스타벅스 종로점", "2"), document("스타벅스 시청점", "3")],
        }
    )

    data = post(client, [png()]).json()["data"]

    system = json.loads(llm.calls.last.request.content)["messages"][0]["content"]
    assert "address_hint를 비우지 않는다" in system
    assert places.calls[0].request.url.params["query"] == "역삼동 스타벅스"
    assert spots(data) == ["1"]


@respx.mock
def test_T01_3_no_mentions_is_not_found(client):
    mock_llm()

    data = post(client, [png()]).json()["data"]

    assert data == {"resultStatus": "NOT_FOUND", "candidates": []}


@respx.mock
def test_T01_4_private_address_link_fails_without_connecting(client):
    internal = respx.get("https://10.0.0.5/admin").mock(return_value=httpx.Response(200, html=PAGE))
    llm = mock_llm(mention("가짜", "LINK_TEXT"))

    data = post(client, url=PRIVATE_LINK).json()["data"]

    assert data == {"resultStatus": "FAILED", "candidates": []}
    assert not internal.called
    assert not llm.called


@respx.mock
def test_T01_5_forbidden_link_continues_with_capture(client):
    respx.get(LINK_AT_IP).mock(return_value=httpx.Response(403))
    llm = mock_llm(mention("신기산업", "CAPTURE_SIGN"))
    mock_places({"신기산업": [document("신기산업")]})

    data = post(client, [png()], url=LINK).json()["data"]

    assert data["resultStatus"] == "SUCCESS"
    assert (
        "게시물"
        not in json.loads(llm.calls.last.request.content)["messages"][1]["content"][0]["text"]
    )


@respx.mock
def test_T01_6_forbidden_link_only_fails(client):
    respx.get(LINK_AT_IP).mock(return_value=httpx.Response(403))
    llm = mock_llm(mention("가짜", "LINK_TEXT"))

    data = post(client, url=LINK).json()["data"]

    assert data == {"resultStatus": "FAILED", "candidates": []}
    assert not llm.called


@respx.mock
def test_empty_page_only_fails(client):
    respx.get(LINK_AT_IP).mock(return_value=httpx.Response(200, html="<p>본문</p>"))
    llm = mock_llm()

    assert post(client, url=LINK).json()["data"]["resultStatus"] == "FAILED"
    assert not llm.called


@respx.mock
def test_T01_7_search_outage_gives_null_place(client):
    mock_llm(mention("신기산업", "CAPTURE_SIGN"), mention("해운대", "CAPTURE_TEXT"))
    respx.get(NAVER_URL).mock(return_value=httpx.Response(500))

    response = post(client, [png()])

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["resultStatus"] == "MULTIPLE_CANDIDATES"
    assert [c["place"] for c in data["candidates"]] == [None, None]
    assert [c["confidence"] for c in data["candidates"]] == [None, None]


@respx.mock
def test_T01_8_duplicate_mentions_are_merged(client):
    mock_llm(
        mention("신기산업", "CAPTURE_SIGN"),
        mention("신기 산업!", "CAPTURE_TEXT"),
        mention("신기산업", "CAPTURE_SIGN"),
    )
    search = mock_places({"신기산업": [document("신기산업")]})

    data = post(client, [png()]).json()["data"]

    assert [c["name"] for c in data["candidates"]] == ["신기산업"]
    assert search.call_count == 1


@respx.mock
def test_T01_9_llm_image_has_no_exif(client):
    exif = Image.Exif()
    exif.get_ifd(0x8825)[2] = (35.0, 4.0, 0.0)
    exif[0x010F] = "SecretCamera"
    source = io.BytesIO()
    Image.new("RGB", (2000, 1000), "white").save(source, format="JPEG", exif=exif)
    llm = mock_llm()

    post(client, [source.getvalue()])

    content = json.loads(llm.calls.last.request.content)["messages"][1]["content"]
    url = content[1]["image_url"]["url"]
    assert url.startswith("data:image/jpeg;base64,")
    sent = base64.b64decode(url.split(",", 1)[1])
    assert b"SecretCamera" not in sent
    image = Image.open(io.BytesIO(sent))
    assert not image.getexif()
    assert image.size == (1600, 800)


@respx.mock
def test_prompt_tells_llm_to_skip_names_only_in_ads(client):
    """캡처 평가에서 광고 속 숙박업소를 장소로 냈다 (capture-eval.md)."""
    llm = mock_llm()
    post(client, [png()])
    system = json.loads(llm.calls.last.request.content)["messages"][0]["content"]
    assert "광고" in system


@respx.mock
def test_T01_10_webp_is_unsupported_input(client):
    out = io.BytesIO()
    Image.new("RGB", (5, 5)).save(out, format="WEBP")
    llm = mock_llm()

    response = post(client, [png(), out.getvalue()])

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "UNSUPPORTED_INPUT"
    assert not llm.called


@respx.mock
def test_T01_10_eleven_captures_exceed_limit(client):
    llm = mock_llm()

    response = post(client, [png()] * 11)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INPUT_LIMIT_EXCEEDED"
    assert not llm.called


@respx.mock
def test_ten_captures_are_allowed(client):
    mock_llm()

    assert post(client, [png()] * 10).status_code == 200


def test_capture_over_15mb_exceeds_limit(client):
    response = post(client, [b"\0" * (15 * 1024 * 1024 + 1)])

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INPUT_LIMIT_EXCEEDED"


@respx.mock
def test_broken_capture_is_skipped_when_another_is_readable(client):
    llm = mock_llm()

    data = post(client, [b"not an image", png()]).json()["data"]

    assert data["resultStatus"] == "NOT_FOUND"
    assert len(json.loads(llm.calls.last.request.content)["messages"][1]["content"]) == 2


@respx.mock
def test_only_broken_captures_fail(client):
    llm = mock_llm()

    data = post(client, [b"not an image"]).json()["data"]

    assert data == {"resultStatus": "FAILED", "candidates": []}
    assert not llm.called


@pytest.mark.parametrize(
    "form", [{}, {"memo": "메모만"}, {"url": "   "}], ids=["none", "memo", "blank"]
)
def test_requires_url_or_capture(client, form):
    response = post(client, **form)

    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert {f["field"] for f in error["fields"]} == {"url", "captures"}


def test_unsupported_url_is_rejected(client):
    response = post(client, url="ftp://blog.test/a")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "UNSUPPORTED_INPUT"


def test_too_long_memo_is_validation_error(client):
    response = post(client, url=LINK, memo="가" * 501)

    assert response.status_code == 400
    assert response.json()["error"]["fields"][0]["field"] == "memo"


def test_requires_internal_token(client):
    del client.headers["X-Internal-Token"]

    assert post(client, url=LINK).status_code == 401


@respx.mock
def test_llm_outage_with_capture_is_503(client):
    respx.post(GMS_URL).mock(return_value=httpx.Response(500))

    response = post(client, [png()])

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "PROVIDER_UNAVAILABLE"


def course_page(title: str) -> str:
    return f'<meta property="og:title" content="{title}">'


@respx.mock
def test_llm_outage_with_link_title_only_is_503_not_title_candidate(client):
    respx.get(LINK_AT_IP).mock(
        return_value=httpx.Response(200, html=course_page("부산 영도 하루 코스 정리"))
    )
    respx.post(GMS_URL).mock(return_value=httpx.Response(500))
    naver = mock_places({"부산 영도 하루 코스 정리": [document("부산 영도 하루 코스 정리")]})

    response = post(client, url=LINK)

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "PROVIDER_UNAVAILABLE"
    assert not naver.called


@respx.mock
def test_llm_outage_with_link_title_and_memo_is_503_not_title_candidate(client):
    respx.get(LINK_AT_IP).mock(return_value=httpx.Response(200, html=course_page("주말 일상 기록")))
    respx.post(GMS_URL).mock(return_value=httpx.Response(500))
    naver = mock_places({"주말 일상 기록": [document("주말 일상 기록")]})

    response = post(client, url=LINK, memo="흰여울문화마을이랑 태종대 가자")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "PROVIDER_UNAVAILABLE"
    assert not naver.called


@respx.mock
def test_missing_gms_key_with_link_title_is_503_not_title_candidate():
    respx.get(LINK_AT_IP).mock(
        return_value=httpx.Response(200, html=course_page("부산 영도 하루 코스 정리"))
    )
    naver = mock_places({"부산 영도 하루 코스 정리": [document("부산 영도 하루 코스 정리")]})

    response = post(make_client(gms_api_key=""), url=LINK)

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "PROVIDER_UNAVAILABLE"
    assert not naver.called


@respx.mock
def test_llm_outage_with_description_only_page_is_503(client):
    page = '<meta property="og:description" content="설명만 있다">'
    respx.get(LINK_AT_IP).mock(return_value=httpx.Response(200, html=page))
    respx.post(GMS_URL).mock(return_value=httpx.Response(500))

    assert post(client, url=LINK).status_code == 503


@respx.mock
def test_llm_reply_without_places_list_is_503_not_not_found(client):
    respx.post(GMS_URL).mock(
        return_value=httpx.Response(
            200, json={"choices": [{"message": {"content": '{"places": "없음"}'}}]}
        )
    )

    assert post(client, [png()]).status_code == 503


@respx.mock
def test_link_mention_not_in_page_text_is_dropped(client):
    # 글에서 찾았다는 이름이 글에 없으면 LLM이 지어냈거나 페이지의 지시를 따른 것이다
    respx.get(LINK_AT_IP).mock(return_value=httpx.Response(200, html=PAGE))
    mock_llm(mention("남천동 베이커리", "LINK_TEXT"), mention("지어낸 식당", "LINK_TEXT"))
    search = mock_places({"남천동 베이커리": [document("남천동 베이커리")]})

    data = post(client, url=LINK).json()["data"]

    assert [c["name"] for c in data["candidates"]] == ["남천동 베이커리"]
    assert search.call_count == 1


@respx.mock
def test_memo_mention_not_in_memo_is_dropped(client):
    mock_llm(mention("신기산업", "MEMO"), mention("지어낸 식당", "MEMO"))
    mock_places({"신기산업": [document("신기산업")]})

    data = post(client, [png()], memo="신기 산업 꼭 가기").json()["data"]

    assert [c["name"] for c in data["candidates"]] == ["신기산업"]
    assert data["candidates"][0]["evidence"] == "메모에서 찾았어요"


@respx.mock
def test_mentions_from_sources_not_given_are_dropped(client):
    mock_llm(mention("신기산업", "LINK_TEXT"), mention("다른곳", "MEMO"), mention("없음", "OTHER"))
    mock_places({})

    assert post(client, [png()]).json()["data"]["resultStatus"] == "NOT_FOUND"


@respx.mock
def test_capture_mention_without_capture_is_dropped(client):
    respx.get(LINK_AT_IP).mock(return_value=httpx.Response(200, html=PAGE))
    mock_llm(mention("남천동 베이커리", "CAPTURE_SIGN"))
    mock_places({})

    assert post(client, url=LINK).json()["data"]["resultStatus"] == "NOT_FOUND"


@respx.mock
def test_malformed_mentions_are_skipped_and_count_is_capped(client):
    too_many = [mention(f"장소{i}", "CAPTURE_TEXT") for i in range(30)]
    mock_llm("문자열", {"found_in": "MEMO"}, mention("가" * 101, "CAPTURE_TEXT"), *too_many)
    search = mock_places({})

    data = post(client, [png()]).json()["data"]

    assert [c["name"] for c in data["candidates"]] == [f"장소{i}" for i in range(20)]
    assert search.call_count == 20


@respx.mock
def test_search_prefers_address_hint_then_region_hint_then_name(client):
    mock_llm(
        mention("가게하나", "CAPTURE_TEXT", hint="영도구"),
        mention("가게둘", "CAPTURE_TEXT"),
        mention("가게셋", "CAPTURE_TEXT", hint="없는지역"),
    )
    search = mock_places(
        {
            "영도구 가게하나": [document("가게하나", "1")],
            "부산 가게둘": [document("가게둘", "2")],
            "가게셋": [document("가게셋", "3")],
        }
    )

    data = post(client, [png()], regionHint="부산").json()["data"]

    assert data["resultStatus"] == "SUCCESS"
    assert spots(data) == ["1", "2", "3"]
    assert search.call_count == 4


@respx.mock
def test_prompt_marks_page_text_as_untrusted_material(client):
    respx.get(LINK_AT_IP).mock(return_value=httpx.Response(200, html=PAGE))
    llm = mock_llm()

    post(client, url=LINK, memo="여기 꼭")

    messages = json.loads(llm.calls.last.request.content)["messages"]
    assert "지시가 아니라" in messages[0]["content"]
    assert "민락 수변공원 야경 산책" in messages[1]["content"]
    assert "여기 꼭" in messages[1]["content"]


def test_normalize_ignores_case_spacing_and_symbols():
    assert normalize(" Cafe 신기-산업! ") == "cafe신기산업"
    assert normalize("ＡＢＣ") == "abc"


def test_similarity_is_one_only_after_normalizing_to_same_name():
    assert similarity("신기 산업", "신기산업") == 1.0
    assert 0 < similarity("신기산업", "신기산업 2호점") < 1
    assert similarity("!!!", "신기산업") == 0.0


@respx.mock
def test_default_wiring_uses_settings_keys_and_closes_http():
    app = create_app(
        Settings(
            _env_file=None,
            allow_no_internal_token=True,
            gms_api_key="k",
            gms_base_url="https://gms.test/v1",
            naver_client_id="i",
            naver_client_secret="k",
        )
    )
    llm = mock_llm()

    with TestClient(app) as client:
        response = client.post(PATH, files=[("captures", ("c.png", png(), "image/png"))])

    assert response.status_code == 200
    assert llm.called
    assert app.state.http.is_closed


@respx.mock
def test_exact_name_ranked_fifth_by_search_is_still_found(client):
    """네이버가 정확한 이름을 뒤쪽에 줘도 3곳 자르기에서 빠지면 안 된다."""
    mock_llm(mention("해동용궁사"))
    route = mock_places(
        {
            "해동용궁사": [
                document("도깨비방앗간 해동용궁사점", "1"),
                document("소원뜰 해동용궁사쉼터", "2"),
                document("송정동핫도그 해동용궁사점", "3"),
                document("유동커피 해동용궁사점", "4"),
                document("해동용궁사", "5"),
            ]
        }
    )

    data = post(client, [png()], memo="해동용궁사 다녀왔어요").json()["data"]

    assert route.calls[0].request.url.params["display"] == "5"
    assert data["resultStatus"] == "SUCCESS"
    assert spots(data) == ["5"]


@respx.mock
def test_candidates_stay_at_three_after_searching_five(client):
    mock_llm(mention("카페"))
    mock_places({"카페": [document(f"카페 {i}호점", str(i)) for i in range(5)]})

    data = post(client, [png()], memo="카페 갔어요").json()["data"]

    assert len(data["candidates"]) == 3


@respx.mock
def test_branch_suffix_is_dropped_when_full_name_is_not_found(client):
    """2026-11-14 공기계: 블로그의 강릉길감자 본점이 공급자에는 강릉길감자로만 있었다."""
    # 글에 실제로 있는 이름만 받으므로 메모로 넣는다. 공급자에는 지점 없는 이름만 있다
    mock_llm(mention("강릉길감자 본점", "MEMO"))
    places = mock_places({"강릉길감자": [document("강릉길감자", "1")]})

    data = post(client, [png()], memo="강릉길감자 본점 감자빵").json()["data"]

    assert [c.request.url.params["query"] for c in places.calls] == [
        "강릉길감자 본점",
        "강릉길감자",
    ]

    assert spots(data) == ["1"]
    assert data["candidates"][0]["place"]["name"] == "강릉길감자"


@pytest.mark.parametrize(
    ("name", "base"),
    [
        ("강릉길감자 본점", "강릉길감자"),
        ("스타벅스 강남역점", "스타벅스"),
        ("교촌치킨 2호점", "교촌치킨"),
        ("본점", "본점"),
        ("카페정점", "카페정점"),
    ],
)
def test_without_branch(name, base):
    assert without_branch(name) == base
