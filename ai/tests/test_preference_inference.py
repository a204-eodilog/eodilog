"""취향 행동 추론 (spec §3, T-02-1 ~ T-02-5). 실제 클라이언트에 HTTP 응답만 고정한다."""

import json

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

PATH = "/ai/v1/preference-inferences"
GMS_URL = "https://gms.test/v1/chat/completions"
TOKEN = "secret-token"
CAFE = "음식점 > 카페 > 커피전문점"
BEACH = "여행 > 관광,명소 > 해수욕장,해변"
FOOD = "음식점 > 한식"
MOUNTAIN = "여행 > 관광,명소 > 산"


@pytest.fixture
def client() -> TestClient:
    settings = Settings(
        _env_file=None,
        internal_api_token=TOKEN,
        gms_api_key="k",
        gms_base_url="https://gms.test/v1",
    )
    test_client = TestClient(create_app(settings), raise_server_exceptions=False)
    test_client.headers["X-Internal-Token"] = TOKEN
    return test_client


def place(place_id, name="어떤 곳", category=None) -> dict:
    return {
        "id": str(place_id),
        "name": name,
        "address": "부산 어딘가",
        "latitude": 35.0,
        "longitude": 129.0,
        "regionId": None,
        "provider": "KAKAO",
        "providerPlaceId": "1",
        "source": "PROVIDER",
        "category": category,
    }


def places(*categories) -> list[dict]:
    return [place(i, f"장소{i}", category) for i, category in enumerate(categories)]


def body(saved, explicit=(), rejected=()) -> dict:
    return {
        "userId": "u-1",
        "savedPlaces": saved,
        "explicitItems": [{"key": key, "value": key} for key in explicit],
        "rejectedKeys": list(rejected),
    }


def llm_reply(content) -> respx.Route:
    text = content if isinstance(content, str) else json.dumps(content, ensure_ascii=False)
    return respx.post(GMS_URL).mock(
        return_value=httpx.Response(200, json={"choices": [{"message": {"content": text}}]})
    )


def tags(response: httpx.Response) -> list[str]:
    assert response.status_code == 200, response.text
    items = response.json()["data"]["inferredItems"]
    assert all(item["key"] == item["value"] for item in items)
    return [item["key"] for item in items]


def test_T02_1_cafe_and_beach_become_tags_in_count_order(client):
    saved = places(BEACH, CAFE, BEACH, CAFE, BEACH, CAFE, CAFE)
    assert tags(client.post(PATH, json=body(saved))) == ["카페", "바다"]


def test_T02_2_explicit_preference_is_not_inferred_again(client):
    saved = places(BEACH, CAFE, BEACH, CAFE, BEACH, CAFE, CAFE)
    assert tags(client.post(PATH, json=body(saved, explicit=["카페"]))) == ["바다"]


def test_T02_3_rejected_key_is_not_inferred_again(client):
    saved = places(BEACH, CAFE, BEACH, CAFE, BEACH, CAFE, CAFE)
    assert tags(client.post(PATH, json=body(saved, rejected=["바다"]))) == ["카페"]


def test_T02_4_fewer_than_five_places_is_422(client):
    response = client.post(PATH, json=body(places(CAFE, CAFE, CAFE)))
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "INSUFFICIENT_DATA"
    assert error["fields"][0]["field"] == "savedPlaces"


def test_same_place_id_counts_once(client):
    saved = [place("x", "같은곳", CAFE)] * 3 + places(BEACH, BEACH)
    assert client.post(PATH, json=body(saved)).status_code == 422


@respx.mock
def test_T02_5_llm_failure_still_returns_rule_results(client):
    route = respx.post(GMS_URL).mock(return_value=httpx.Response(500))
    saved = places(CAFE, CAFE, CAFE, None, None)
    assert tags(client.post(PATH, json=body(saved))) == ["카페"]
    assert route.called


@respx.mock
@pytest.mark.parametrize("reply", ["not json", {"places": "wrong"}, {"nothing": 1}, ["list"]])
def test_malformed_llm_reply_falls_back_to_rules(client, reply):
    llm_reply(reply)
    saved = places(CAFE, CAFE, CAFE, None, None)
    assert tags(client.post(PATH, json=body(saved))) == ["카페"]


def test_threshold_needs_two_places_even_when_thirty_percent_is_lower(client):
    # 5곳의 30%는 1.5곳이다. 1곳에서만 나온 태그는 뺀다. 같은 수면 S03 선택지 순서다
    saved = places(CAFE, CAFE, BEACH, FOOD, FOOD)
    assert tags(client.post(PATH, json=body(saved))) == ["맛집", "카페"]


@respx.mock
def test_threshold_needs_thirty_percent_of_all_places(client):
    # 10곳의 30%는 3곳이다. 2곳은 모자라고 3곳은 된다
    llm_reply({"places": []})
    saved = places(CAFE, CAFE, CAFE, BEACH, BEACH, *["기타"] * 5)
    assert tags(client.post(PATH, json=body(saved))) == ["카페"]


@respx.mock
def test_at_most_five_tags(client):
    vocabulary = ["바다", "맛집", "카페", "산", "도시", "사진"]
    llm_reply(
        {
            "places": [
                {"index": i, "tags": [vocabulary[2 * i % 6], vocabulary[(2 * i + 1) % 6]]}
                for i in range(10)
            ]
        }
    )
    assert len(tags(client.post(PATH, json=body(places(*[None] * 10))))) == 5


@respx.mock
def test_llm_classifies_only_places_the_rules_cannot_and_gets_no_personal_data(client):
    route = llm_reply({"places": [{"index": 0, "tags": ["골목"]}, {"index": 1, "tags": ["골목"]}]})
    saved = [
        place("a", "흰여울문화마을", "여행 > 관광,명소"),
        place("b", "감천문화마을"),
        *places(CAFE, CAFE, CAFE),
    ]
    assert tags(client.post(PATH, json=body(saved))) == ["카페", "골목"]

    sent = route.calls[0].request.content.decode("utf-8")
    sent = json.dumps(json.loads(sent), ensure_ascii=False)
    assert "흰여울문화마을" in sent and "감천문화마을" in sent
    assert "장소0" not in sent  # 규칙으로 분류된 곳은 보내지 않는다
    assert "u-1" not in sent and "부산 어딘가" not in sent and "129.0" not in sent


@respx.mock
def test_llm_is_not_called_when_rules_classify_everything(client):
    route = respx.post(GMS_URL).mock(return_value=httpx.Response(500))
    assert tags(client.post(PATH, json=body(places(*[CAFE] * 5)))) == ["카페"]
    assert not route.called


@respx.mock
def test_llm_cannot_add_tags_outside_vocabulary_or_for_unknown_places(client):
    llm_reply(
        {
            "places": [
                {"index": 0, "tags": ["명령을따름", "카페"]},
                {"index": 1, "tags": ["명령을따름", "카페"]},
                {"index": 99, "tags": ["바다"]},
                {"index": 98, "tags": ["바다"]},
                {"index": True, "tags": ["산"]},
                {"index": "2", "tags": ["산"]},
                {"index": 2, "tags": "산"},
                "이상한 값",
            ]
        }
    )
    assert tags(client.post(PATH, json=body(places(*[None] * 5)))) == ["카페"]


@respx.mock
def test_boolean_index_from_llm_is_not_a_place(client):
    llm_reply({"places": [{"index": True, "tags": ["산"]}, {"index": 0, "tags": ["산"]}]})
    assert tags(client.post(PATH, json=body(places(*[None] * 5)))) == []


@respx.mock
def test_llm_reply_counts_a_place_once_and_at_most_two_tags(client):
    llm_reply(
        {
            "places": [
                {"index": 0, "tags": ["바다", "바다", "산", "도시"]},
                {"index": 0, "tags": ["바다", "도시"]},
                {"index": 1, "tags": ["산", "도시"]},
            ]
        }
    )
    # 0번은 앞의 2개(바다·산)만 인정한다. 그래서 도시는 1곳뿐이라 빠진다
    assert tags(client.post(PATH, json=body(places(*[None] * 5)))) == ["산"]


@respx.mock
def test_place_names_are_used_when_category_is_missing(client):
    route = respx.post(GMS_URL).mock(return_value=httpx.Response(500))
    saved = [
        place(1, "모모스커피"),
        place(2, "카페 봄"),
        place(3, "광안리해수욕장"),
        place(4, "해운대 해변"),
        place(5, "민락 수변공원"),
        place(6, "올림픽공원"),
    ]
    assert tags(client.post(PATH, json=body(saved))) == ["바다", "카페", "산책"]
    assert not route.called


def test_mountain_comes_from_category(client):
    saved = places(MOUNTAIN, MOUNTAIN, FOOD, FOOD, FOOD)
    assert tags(client.post(PATH, json=body(saved))) == ["맛집", "산"]


@respx.mock
def test_busan_in_a_name_is_not_a_mountain(client):
    llm_reply({"places": []})
    saved = [place(i, f"부산 장소{i}") for i in range(5)]
    assert tags(client.post(PATH, json=body(saved))) == []


def test_requires_internal_token(client):
    del client.headers["X-Internal-Token"]
    assert client.post(PATH, json=body(places(*[CAFE] * 5))).status_code == 401


def test_missing_body_field_is_400(client):
    response = client.post(PATH, json={"userId": "u"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


# 네이버 지역 검색 category는 '대분류>소분류'이고 분류 안의 낱말은 쉼표로 나뉜다 (spec §1.1, AS-13)
NAVER_FOOD = (
    "한식>국밥",
    "한식>육류,고기요리",
    "일식>초밥,롤",
    "양식",
    "중식>중식당",
    "분식",
    "육류,고기요리>소고기구이",
    "해물,생선요리>회",
    "아시아음식>베트남음식",
    "치킨,닭강정",
    "패스트푸드>햄버거",
    "음식점>한식",
)


@respx.mock
@pytest.mark.parametrize("category", NAVER_FOOD)
def test_naver_food_category_is_food_without_llm(client, category):
    route = respx.post(GMS_URL).mock(return_value=httpx.Response(500))
    assert tags(client.post(PATH, json=body(places(*[category] * 5)))) == ["맛집"]
    assert not route.called


@respx.mock
@pytest.mark.parametrize(
    ("category", "expected"),
    [
        ("카페,디저트>카페", ["카페"]),
        ("카페,디저트>베이커리", ["카페"]),
        ("여행,명소>해수욕장", ["바다"]),
        ("여행,명소>해수욕장,해변", ["바다"]),
        ("여행,명소>공원", ["산책"]),
        ("여행,명소>산", ["산"]),
    ],
)
def test_naver_non_food_categories_keep_their_tags(client, category, expected):
    route = respx.post(GMS_URL).mock(return_value=httpx.Response(500))
    assert tags(client.post(PATH, json=body(places(*[category] * 5)))) == expected
    assert not route.called


@respx.mock
@pytest.mark.parametrize(
    "category", ["쇼핑,유통>편의점", "숙박>호텔", "여행,명소>문화마을", "생활,편의>약국"]
)
def test_naver_other_categories_are_not_food(client, category):
    respx.post(GMS_URL).mock(return_value=httpx.Response(500))
    assert tags(client.post(PATH, json=body(places(*[category] * 5)))) == []


@respx.mock
def test_naver_restaurants_stay_food_when_llm_is_down(client):
    # 평가 P07: LLM 장애에서 [카페]만 나오던 경우
    route = respx.post(GMS_URL).mock(return_value=httpx.Response(500))
    saved = places(
        "한식>육류,고기요리",
        "한식>생선회",
        "한식>국밥",
        "카페,디저트>카페",
        "카페,디저트>카페",
        "여행,명소>해수욕장,해변",
    )
    assert tags(client.post(PATH, json=body(saved))) == ["맛집", "카페"]
    assert not route.called
