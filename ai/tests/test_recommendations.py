"""비슷한 여행 추천과 친구 추천 (spec §9). 규칙 점수만 쓰고 외부 호출은 없다."""

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

DISCOVERY = "/ai/v1/discovery-recommendations"
FOLLOW = "/ai/v1/follow-suggestions"
TOKEN = "secret-token"
SIMILAR_REASON = "좋아요한 여행과 비슷해요"


@pytest.fixture
def client() -> TestClient:
    settings = Settings(_env_file=None, internal_api_token=TOKEN)
    test_client = TestClient(create_app(settings), raise_server_exceptions=False)
    test_client.headers["X-Internal-Token"] = TOKEN
    return test_client


def entry(id_: str, *, type_="PLACE", region="강원 강릉", tags=(), categories=()) -> dict:
    return {
        "type": type_,
        "id": id_,
        "regionName": region,
        "tags": list(tags),
        "placeCategories": list(categories),
    }


def discover(client: TestClient, liked: list[dict], candidates: list[dict], **extra):
    return client.post(DISCOVERY, json={"liked": liked, "candidates": candidates, **extra})


def ids(response) -> list[str]:
    assert response.status_code == 200, response.text
    return [item["placeId"] or item["feedId"] for item in response.json()["data"]["items"]]


def person(user_id: str, tastes=(), trips=0) -> dict:
    return {"userId": user_id, "publicTastes": list(tastes), "publicTripCount": trips}


def suggest(client: TestClient, mine: list[str], candidates: list[dict], **extra):
    body = {"userId": "me", "myPublicTastes": mine, "candidates": candidates, **extra}
    return client.post(FOLLOW, json=body)


def user_ids(response) -> list[str]:
    assert response.status_code == 200, response.text
    return [item["userId"] for item in response.json()["data"]["items"]]


def test_discovery_requires_a_liked_item(client):
    response = discover(client, [], [entry("a", tags=["바다"])])
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INSUFFICIENT_DATA"


def test_discovery_requires_internal_token(client):
    del client.headers["X-Internal-Token"]
    assert discover(client, [entry("x")], []).status_code == 401


def test_discovery_scores_tags_then_region_then_category(client):
    liked = [entry("liked", region="강원 강릉", tags=["바다", "카페"], categories=["해수욕장"])]
    candidates = [
        entry("category-1", region="부산 해운대", categories=["해수욕장"]),
        entry("region-2", region="강원 속초"),
        entry("tag-category-3", region="부산 해운대", tags=["바다"], categories=["해수욕장"]),
        entry("two-tags-4", region="부산 해운대", tags=["바다", "카페"]),
    ]
    assert ids(discover(client, liked, candidates)) == [
        "two-tags-4",
        "tag-category-3",
        "region-2",
        "category-1",
    ]


def test_discovery_combines_signals_from_all_liked_items(client):
    liked = [
        entry("l1", region="제주 서귀포", tags=["바다"]),
        entry("l2", region="강원 강릉", tags=["카페"]),
    ]
    candidates = [
        entry("first-liked", region="부산 해운대", tags=["바다"]),
        entry("second-liked", region="강원 속초", tags=["카페"]),
    ]
    assert ids(discover(client, liked, candidates)) == ["second-liked", "first-liked"]


def test_discovery_maps_id_by_type_with_the_spec_reason(client):
    liked = [entry("l", tags=["바다"])]
    candidates = [
        entry("feed-1", type_="FEED", tags=["바다"]),
        entry("place-1", type_="PLACE", tags=["바다"]),
    ]
    assert discover(client, liked, candidates).json()["data"]["items"] == [
        {"type": "FEED", "feedId": "feed-1", "placeId": None, "reason": SIMILAR_REASON},
        {"type": "PLACE", "feedId": None, "placeId": "place-1", "reason": SIMILAR_REASON},
    ]


def test_discovery_leaves_out_candidates_with_nothing_in_common(client):
    liked = [entry("l", region="강원 강릉", tags=["바다"], categories=["해수욕장"])]
    candidates = [entry("none", region="부산 해운대", tags=["산"], categories=["등산로"])]
    assert ids(discover(client, liked, candidates)) == []


def test_discovery_does_not_recommend_what_was_already_liked(client):
    liked = [entry("same", tags=["바다"])]
    candidates = [entry("same", tags=["바다"]), entry("other", tags=["바다"])]
    assert ids(discover(client, liked, candidates)) == ["other"]


def test_discovery_same_id_of_another_type_is_a_different_item(client):
    liked = [entry("same", type_="FEED", tags=["바다"])]
    assert ids(discover(client, liked, [entry("same", type_="PLACE", tags=["바다"])])) == ["same"]


def test_discovery_repeated_candidate_appears_once(client):
    liked = [entry("l", tags=["바다"])]
    candidates = [entry("dup", tags=["바다"]), entry("dup", tags=["바다"])]
    assert ids(discover(client, liked, candidates)) == ["dup"]


def test_discovery_repeated_tag_counts_once(client):
    liked = [entry("l", region="제주 서귀포", tags=["바다", "카페"])]
    candidates = [
        entry("repeated", region="부산 해운대", tags=["바다", " 바다"]),
        entry("two-tags", region="부산 해운대", tags=["바다", "카페"]),
    ]
    assert ids(discover(client, liked, candidates)) == ["two-tags", "repeated"]


def test_discovery_keeps_input_order_on_ties_and_applies_limit(client):
    liked = [entry("l", tags=["바다"])]
    candidates = [entry(name, tags=["바다"]) for name in ("a", "b", "c")]
    assert ids(discover(client, liked, candidates, limit=2)) == ["a", "b"]


def test_discovery_default_limit_is_ten(client):
    liked = [entry("l", tags=["바다"])]
    candidates = [entry(str(n), tags=["바다"]) for n in range(12)]
    assert len(ids(discover(client, liked, candidates))) == 10


def test_discovery_missing_region_does_not_match_missing_region(client):
    liked = [entry("l", region=None)]
    assert ids(discover(client, liked, [entry("c", region=None)])) == []


@pytest.mark.parametrize("limit", [0, -1])
def test_discovery_rejects_limit_below_one(client, limit):
    response = discover(client, [entry("l")], [], limit=limit)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_discovery_rejects_unknown_type(client):
    assert discover(client, [entry("l", type_="USER")], []).status_code == 400


def test_follow_requires_internal_token(client):
    del client.headers["X-Internal-Token"]
    assert suggest(client, [], []).status_code == 401


def test_follow_scores_taste_matches_then_capped_trip_count(client):
    candidates = [
        person("trips-only-2.5", trips=5),
        person("one-taste-2", ["바다"]),
        person("two-tastes-4", ["바다", "카페"]),
        person("one-taste-and-trips-3", ["바다"], trips=2),
    ]
    assert user_ids(suggest(client, ["바다", "카페"], candidates)) == [
        "two-tastes-4",
        "one-taste-and-trips-3",
        "trips-only-2.5",
        "one-taste-2",
    ]


def test_follow_trip_count_stops_counting_at_five(client):
    candidates = [person("five", trips=5), person("hundred", trips=100)]
    assert user_ids(suggest(client, [], candidates)) == ["five", "hundred"]


def test_follow_reason_lists_shared_tastes(client):
    response = suggest(client, ["바다", "산", "카페"], [person("u", ["카페", "바다"], trips=3)])
    assert response.json()["data"]["items"] == [
        {"userId": "u", "reason": "공개 취향이 같아요 · 바다, 카페"}
    ]


def test_follow_reason_without_shared_taste_uses_trip_count(client):
    response = suggest(client, ["바다"], [person("u", ["산"], trips=3)])
    assert response.json()["data"]["items"] == [
        {"userId": "u", "reason": "공개 여행 3개를 올렸어요"}
    ]


def test_follow_leaves_out_candidates_without_any_signal(client):
    assert user_ids(suggest(client, ["바다"], [person("u", ["산"], trips=0)])) == []


def test_follow_does_not_suggest_the_requester(client):
    candidates = [person("me", ["바다"]), person("u", ["바다"])]
    assert user_ids(suggest(client, ["바다"], candidates)) == ["u"]


def test_follow_repeated_taste_counts_once(client):
    candidates = [person("repeated", ["바다", "바다"]), person("two", ["바다", "카페"])]
    response = suggest(client, ["바다", "카페"], candidates)
    assert user_ids(response) == ["two", "repeated"]
    assert response.json()["data"]["items"][1]["reason"] == "공개 취향이 같아요 · 바다"


def test_follow_repeated_candidate_appears_once(client):
    candidates = [person("dup", ["바다"]), person("dup", ["바다"])]
    assert user_ids(suggest(client, ["바다"], candidates)) == ["dup"]


def test_follow_applies_limit_and_keeps_input_order_on_ties(client):
    candidates = [person(name, ["바다"]) for name in ("a", "b", "c")]
    assert user_ids(suggest(client, ["바다"], candidates, limit=2)) == ["a", "b"]


def test_follow_rejects_negative_trip_count(client):
    assert suggest(client, [], [person("u", trips=-1)]).status_code == 400


def test_follow_response_has_no_tag_chip_field(client):
    item = suggest(client, ["바다"], [person("u", ["바다"])]).json()["data"]["items"][0]
    assert set(item) == {"userId", "reason"}
