"""여행 추천 (spec §4, T-03-1 ~ T-03-9). 실제 클라이언트에 HTTP 응답만 고정한다."""

import json

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

PATH = "/ai/v1/trip-recommendations"
GMS_URL = "https://gms.test/v1/chat/completions"
TOKEN = "secret-token"
BUSAN_LAT, BUSAN_LNG = 35.078, 129.045
FAR_LAT = 37.5
SEA = "여행,명소>해수욕장"
CAFE = "카페,디저트>카페"
FOOD = "한식>국밥"


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


def llm_response(content) -> httpx.Response:
    text = content if isinstance(content, str) else json.dumps(content, ensure_ascii=False)
    return httpx.Response(200, json={"choices": [{"message": {"content": text}}]})


@pytest.fixture
def llm():
    """기본은 LLM이 문장을 내지 않는다. 필요한 테스트만 응답을 바꾼다."""
    with respx.mock(assert_all_called=False) as router:
        yield router.post(GMS_URL).mock(return_value=llm_response({"reasons": []}))


def place(place_id, name=None, *, category=None, region="r1", lat=FAR_LAT, lng=127.0) -> dict:
    return {
        "id": place_id,
        "name": name or place_id,
        "address": "부산 어딘가",
        "latitude": lat,
        "longitude": lng,
        "regionId": region,
        "provider": "NAVER",
        "providerPlaceId": f"hash-{place_id}",
        "source": "PROVIDER",
        "category": category,
    }


def saved(item: dict, *members: str) -> dict:
    return {
        "place": item,
        "savedBy": [{"memberId": member, "memo": f"메모-{member}"} for member in members],
        "savedCount": len(members),
    }


def region(region_id, name=None) -> dict:
    return {
        "id": region_id,
        "code": "2620000000",
        "name": name or region_id,
        "parentId": None,
        "latitude": None,
        "longitude": None,
    }


def member(member_id, nickname=None, explicit=(), inferred=()) -> dict:
    return {
        "memberId": member_id,
        "nickname": nickname or member_id,
        "explicit": list(explicit),
        "inferred": list(inferred),
    }


TWO_MEMBERS = [member("a", "세은", ["맛집"]), member("b", "민준", ["맛집"])]
OVERLAP_SAVED = [
    saved(place("s1", "흰여울문화마을"), "a", "b"),
    saved(place("s2"), "a"),
    saved(place("s3"), "b"),
]


def body(**overrides) -> dict:
    return {
        "trip": {
            "id": "t1",
            "startDate": "2026-11-14",
            "endDate": "2026-11-15",
            "destinationRegionIds": ["r1"],
        },
        "members": TWO_MEMBERS,
        "savedPlaces": OVERLAP_SAVED,
        "candidatePlaces": [],
        "regions": [region("r1", "영도구")],
        "excludePlaceIds": [],
    } | overrides


def post(client: TestClient, **overrides) -> dict:
    response = client.post(PATH, json=body(**overrides))
    assert response.status_code == 200, response.text
    return response.json()["data"]


def regions_of(data: dict) -> list[dict]:
    return [item for item in data["items"] if item["type"] == "REGION"]


def places_of(data: dict) -> list[dict]:
    return [item for item in data["items"] if item["type"] == "PLACE"]


def place_ids(data: dict) -> list[str]:
    return [item["place"]["id"] for item in places_of(data)]


def llm_user_message(llm) -> str:
    request = json.loads(llm.calls.last.request.content)
    return request["messages"][1]["content"]


def llm_says(llm, reason: str, key: str = "P1") -> None:
    llm.mock(return_value=llm_response({"reasons": [{"placeKey": key, "reason": reason}]}))


# T-03-1


def test_overlap_and_taste_rank_regions_and_places(client, llm):
    data = post(
        client,
        members=[member("a", "세은", ["바다"]), member("b", "민준", ["바다", "카페"])],
        savedPlaces=[
            saved(place("s1", "구석", region="r2"), "a"),
            saved(place("s2", "흰여울문화마을", region="r1"), "a", "b"),
            saved(place("s3", region="r1"), "b"),
        ],
        candidatePlaces=[
            place("c-cafe", category=CAFE),
            place("c-sea", category=SEA),
        ],
        regions=[region("r2", "중구"), region("r1", "영도구")],
    )

    assert [item["region"]["id"] for item in regions_of(data)] == ["r1", "r2"]
    assert all(item["place"] is None for item in regions_of(data))
    assert regions_of(data)[0]["reason"] == "겹친 장소 흰여울문화마을이 있는 지역이에요"
    assert place_ids(data) == ["c-sea", "c-cafe"]
    assert all(item["region"] is None for item in places_of(data))
    assert data["basis"] == {"sharedPlaceCount": 1, "usedMemberCount": 2}
    assert data["insufficientData"] is False


def test_regions_are_listed_before_places(client, llm):
    data = post(client, candidatePlaces=[place("c1", category=FOOD)])
    assert [item["type"] for item in data["items"]] == ["REGION", "PLACE"]


def test_region_score_counts_overlap_three_times(client, llm):
    data = post(
        client,
        members=[member("a", explicit=["휴식"]), member("b", explicit=["휴식"])],
        savedPlaces=[
            saved(place("s1", region="many"), "a"),
            saved(place("s2", region="many"), "a"),
            saved(place("s3", region="many"), "b"),
            saved(place("s4", region="shared"), "a", "b"),
        ],
        regions=[region("many"), region("shared")],
    )
    # many: 장소 3 = 3점, shared: 겹침 3 + 장소 1 = 4점
    assert [item["region"]["id"] for item in regions_of(data)] == ["shared", "many"]


def test_region_score_adds_taste_matches(client, llm):
    data = post(
        client,
        members=[member("a", explicit=["바다"]), member("b", explicit=["바다"])],
        savedPlaces=[
            saved(place("s1", region="plain"), "a", "b"),
            saved(place("s2", region="sea", category=SEA), "a", "b"),
            saved(place("s3", region="plain"), "a"),
        ],
        regions=[region("plain"), region("sea")],
    )
    # plain: 겹침 3 + 장소 2 = 5점, sea: 겹침 3 + 장소 1 + 취향 4 = 8점
    assert [item["region"]["id"] for item in regions_of(data)] == ["sea", "plain"]


def test_at_most_three_regions(client, llm):
    data = post(
        client,
        savedPlaces=[saved(place(f"s{i}", region=f"r{i}"), "a", "b") for i in range(5)],
        regions=[region(f"r{i}") for i in range(5)],
    )
    assert len(regions_of(data)) == 3


def test_region_without_overlap_gets_its_own_sentence(client, llm):
    data = post(
        client,
        savedPlaces=[
            saved(place("s1", "겹친곳", region="r1"), "a", "b"),
            saved(place("s2", region="r2"), "a"),
            saved(place("s3", region="r2"), "b"),
        ],
        regions=[region("r1"), region("r2")],
    )
    assert regions_of(data)[1]["reason"] == "즐겨찾기 장소 2곳이 있는 지역이에요"


def test_region_reason_particle_follows_the_name(client, llm):
    data = post(
        client,
        savedPlaces=[
            saved(place("s1", "태종대"), "a", "b"),
            *OVERLAP_SAVED[1:],
            saved(place("s4"), "a"),
        ],
    )
    assert regions_of(data)[0]["reason"] == "겹친 장소 태종대가 있는 지역이에요"


def test_region_with_several_overlaps_names_one_and_counts_the_rest(client, llm):
    data = post(
        client,
        savedPlaces=[
            saved(place("s1", "감천문화마을"), "a", "b"),
            saved(place("s2", "태종대"), "a", "b"),
            saved(place("s3"), "a"),
        ],
    )
    assert regions_of(data)[0]["reason"] == "겹친 장소 감천문화마을 외 1곳이 있는 지역이에요"


def test_places_without_a_known_region_are_not_regions(client, llm):
    data = post(
        client,
        savedPlaces=[
            saved(place("s1", region=None), "a", "b"),
            saved(place("s2", region="not-sent"), "a", "b"),
            saved(place("s3", region=None), "a"),
        ],
    )
    assert regions_of(data) == []


def test_explicit_taste_outweighs_inferred(client, llm):
    data = post(
        client,
        members=[member("a", explicit=["바다"], inferred=["카페"]), member("b", explicit=["휴식"])],
        candidatePlaces=[place("c-cafe", category=CAFE), place("c-sea", category=SEA)],
    )
    assert place_ids(data) == ["c-sea", "c-cafe"]


def test_same_taste_in_explicit_and_inferred_counts_once(client, llm):
    data = post(
        client,
        members=[
            member("a", explicit=["카페", "바다"], inferred=["카페"]),
            member("b", explicit=["휴식"]),
        ],
        candidatePlaces=[place("c-sea", category=SEA), place("c-cafe", category=CAFE)],
    )
    assert place_ids(data) == ["c-sea", "c-cafe"]


def test_nearby_overlap_adds_a_point(client, llm):
    near = {"lat": BUSAN_LAT + 0.001, "lng": BUSAN_LNG}
    data = post(
        client,
        savedPlaces=[
            saved(place("s1", lat=BUSAN_LAT, lng=BUSAN_LNG), "a", "b"),
            saved(place("s2"), "a"),
            saved(place("s3"), "b"),
        ],
        candidatePlaces=[place("c-far", category=FOOD), place("c-near", category=FOOD, **near)],
    )
    assert place_ids(data) == ["c-near", "c-far"]


def test_saved_place_without_overlap_gives_no_nearby_point(client, llm):
    near = {"lat": BUSAN_LAT + 0.001, "lng": BUSAN_LNG}
    data = post(
        client,
        savedPlaces=[
            saved(place("s1"), "a", "b"),
            saved(place("s2", lat=BUSAN_LAT, lng=BUSAN_LNG), "a"),
            saved(place("s3"), "b"),
        ],
        candidatePlaces=[place("c-first", category=FOOD), place("c-near", category=FOOD, **near)],
    )
    assert place_ids(data) == ["c-first", "c-near"]


def test_at_most_five_places(client, llm):
    data = post(client, candidatePlaces=[place(f"c{i}", category=FOOD) for i in range(8)])
    assert len(place_ids(data)) == 5


def test_candidate_matching_no_taste_is_not_recommended(client, llm):
    near = {"lat": BUSAN_LAT + 0.001, "lng": BUSAN_LNG}
    data = post(
        client,
        savedPlaces=[
            saved(place("s1", lat=BUSAN_LAT, lng=BUSAN_LNG), "a", "b"),
            saved(place("s2"), "a"),
            saved(place("s3"), "b"),
        ],
        candidatePlaces=[place("c-cafe", category=CAFE, **near)],
    )
    assert places_of(data) == []


def test_taste_word_in_the_name_counts_as_a_match(client, llm):
    data = post(
        client,
        members=[member("a", explicit=["야경"]), member("b", explicit=["휴식"])],
        candidatePlaces=[place("c1", "황령산 야경 전망대")],
    )
    assert place_ids(data) == ["c1"]


def test_one_letter_taste_is_not_found_inside_other_words(client, llm):
    data = post(
        client,
        members=[member("a", explicit=["산"]), member("b", explicit=["휴식"])],
        candidatePlaces=[place("c1", "부산타워")],
    )
    assert place_ids(data) == []


def test_place_keeps_every_input_field(client, llm):
    candidate = place("c1", "돼지국밥집", category=FOOD)
    data = post(client, candidatePlaces=[candidate])
    assert places_of(data)[0]["place"] == candidate


def test_candidate_without_coordinates_is_still_scored(client, llm):
    data = post(client, candidatePlaces=[place("c1", category=FOOD, lat=None, lng=None)])
    assert place_ids(data) == ["c1"]


# T-03-2


def test_entries_of_the_same_place_merge_their_savers(client, llm):
    data = post(
        client,
        savedPlaces=[
            saved(place("s1", "흰여울문화마을"), "a"),
            saved(place("s1", "흰여울문화마을"), "b"),
            saved(place("s2"), "a"),
            saved(place("s3"), "b"),
        ],
    )
    assert data["basis"]["sharedPlaceCount"] == 1


def test_duplicate_entries_do_not_count_as_more_places(client, llm):
    data = post(
        client,
        savedPlaces=[saved(place("s1"), "a"), saved(place("s1"), "b"), saved(place("s2"), "a")],
    )
    assert data["insufficientData"] is True


def test_same_member_twice_is_not_an_overlap(client, llm):
    data = post(
        client,
        savedPlaces=[
            saved(place("s1"), "a", "a"),
            saved(place("s2"), "a"),
            saved(place("s3"), "b"),
        ],
    )
    assert data["basis"]["sharedPlaceCount"] == 0


def test_saved_count_field_is_not_trusted(client, llm):
    entry = saved(place("s1"), "a") | {"savedCount": 9}
    data = post(client, savedPlaces=[entry, saved(place("s2"), "a"), saved(place("s3"), "b")])
    assert data["basis"]["sharedPlaceCount"] == 0


# T-03-3

NO_OVERLAP_SAVED = [saved(place("s1"), "a"), saved(place("s2"), "b"), saved(place("s3"), "a")]


def test_no_overlap_picks_one_place_per_member(client, llm):
    data = post(
        client,
        members=[member("a", "세은", ["바다"]), member("b", "민준", ["카페"])],
        savedPlaces=NO_OVERLAP_SAVED,
        candidatePlaces=[place("c-cafe", category=CAFE), place("c-sea", category=SEA)],
    )
    assert regions_of(data) == []
    assert [(item["place"]["id"], item["reason"]) for item in places_of(data)] == [
        ("c-sea", "세은의 바다 취향으로 골랐어요"),
        ("c-cafe", "민준의 카페 취향으로 골랐어요"),
    ]
    assert data["basis"] == {"sharedPlaceCount": 0, "usedMemberCount": 2}
    assert data["insufficientData"] is False
    assert not llm.called


def test_no_overlap_gives_members_different_places(client, llm):
    data = post(
        client,
        savedPlaces=NO_OVERLAP_SAVED,
        candidatePlaces=[place("c1", category=FOOD), place("c2", category=FOOD)],
    )
    assert place_ids(data) == ["c1", "c2"]


def test_no_overlap_prefers_explicit_taste(client, llm):
    data = post(
        client,
        members=[member("a", "세은", ["바다"], ["카페"]), member("b", "민준", ["휴식"])],
        savedPlaces=NO_OVERLAP_SAVED,
        candidatePlaces=[place("c-cafe", category=CAFE), place("c-sea", category=SEA)],
    )
    assert places_of(data)[0]["reason"] == "세은의 바다 취향으로 골랐어요"


def test_no_overlap_skips_member_with_no_matching_candidate(client, llm):
    data = post(
        client,
        members=[member("a", "세은", ["바다"]), member("b", "민준", ["카페"])],
        savedPlaces=NO_OVERLAP_SAVED,
        candidatePlaces=[place("c-sea", category=SEA)],
    )
    assert place_ids(data) == ["c-sea"]


def test_no_overlap_never_exceeds_five_places(client, llm):
    members = [member(f"m{i}", explicit=["맛집"]) for i in range(7)]
    data = post(
        client,
        members=members,
        savedPlaces=NO_OVERLAP_SAVED,
        candidatePlaces=[place(f"c{i}", category=FOOD) for i in range(7)],
    )
    assert len(place_ids(data)) == 5


# T-03-4


def test_member_without_taste_is_never_named_or_counted(client, llm):
    data = post(
        client,
        members=[
            member("a", "세은", ["바다"]),
            member("b", "민준", ["바다"]),
            member("c", "지호"),
        ],
        savedPlaces=NO_OVERLAP_SAVED,
        candidatePlaces=[place("c1", category=SEA), place("c2", category=SEA)],
    )
    assert "지호" not in json.dumps(data, ensure_ascii=False)
    assert data["basis"]["usedMemberCount"] == 2


def test_blank_tastes_count_as_no_taste(client, llm):
    data = post(client, members=[member("a", explicit=["  "]), member("b", explicit=["맛집"])])
    assert data["insufficientData"] is True


def test_llm_input_has_aliases_only(client, llm):
    post(
        client,
        members=[*TWO_MEMBERS, member("c", "지호")],
        candidatePlaces=[place("c1", "돼지국밥집", category=FOOD)],
    )
    sent = llm_user_message(llm)
    for private in ("세은", "민준", "지호", "메모-", "부산 어딘가", "hash-c1", "memberId"):
        assert private not in sent
    assert json.loads(sent)["places"][0]["matches"] == [
        {"member": "M1", "tastes": ["맛집"]},
        {"member": "M2", "tastes": ["맛집"]},
    ]


# T-03-5


def test_too_few_saved_places_is_insufficient(client, llm):
    data = post(
        client,
        savedPlaces=OVERLAP_SAVED[:2],
        candidatePlaces=[place("c1", category=FOOD)],
    )
    assert data["items"] == []
    assert data["insufficientData"] is True
    assert not llm.called


def test_too_few_members_with_taste_is_insufficient(client, llm):
    data = post(
        client,
        members=[member("a", explicit=["맛집"]), member("b")],
        candidatePlaces=[place("c1", category=FOOD)],
    )
    assert data["items"] == []
    assert data["insufficientData"] is True
    assert data["basis"] == {"sharedPlaceCount": 1, "usedMemberCount": 1}


def test_minimum_data_is_enough(client, llm):
    assert post(client)["insufficientData"] is False


# T-03-6


def test_saved_place_is_not_recommended_again(client, llm):
    data = post(client, candidatePlaces=[place("s1", category=FOOD), place("c1", category=FOOD)])
    assert place_ids(data) == ["c1"]


# T-03-7


def test_excluded_places_are_not_recommended(client, llm):
    data = post(
        client,
        candidatePlaces=[place("c1", category=FOOD), place("c2", category=FOOD)],
        excludePlaceIds=["c1"],
    )
    assert place_ids(data) == ["c2"]


def test_excluded_places_are_skipped_without_overlap(client, llm):
    data = post(
        client,
        savedPlaces=NO_OVERLAP_SAVED,
        candidatePlaces=[place("c1", category=FOOD), place("c2", category=FOOD)],
        excludePlaceIds=["c1"],
    )
    assert place_ids(data) == ["c2"]


def test_duplicate_candidates_are_recommended_once(client, llm):
    data = post(client, candidatePlaces=[place("c1", category=FOOD), place("c1", category=FOOD)])
    assert place_ids(data) == ["c1"]


# T-03-8

RULE_SENTENCE = "맛집을 고른 두 사람에게 맞아요"
ONE_CANDIDATE = [place("c1", "돼지국밥집", category=FOOD)]


def test_llm_reason_is_used(client, llm):
    llm_says(llm, "국밥 좋아하는 취향에 잘 맞아요")
    data = post(client, candidatePlaces=ONE_CANDIDATE)
    assert places_of(data)[0]["reason"] == "국밥 좋아하는 취향에 잘 맞아요"


def test_llm_outage_falls_back_to_rule_sentence(client, llm):
    llm.mock(return_value=httpx.Response(500))
    data = post(client, candidatePlaces=ONE_CANDIDATE)
    assert places_of(data)[0]["reason"] == RULE_SENTENCE


@pytest.mark.parametrize(
    "reply",
    [
        "not json",
        {"reasons": "x"},
        {"reasons": ["x"]},
        {"reasons": [{"placeKey": "P1"}]},
        {"reasons": [{"placeKey": "P9", "reason": "다른 장소"}]},
        {"reasons": [{"placeKey": "P1", "reason": "   "}]},
        {"reasons": [{"placeKey": "P1", "reason": "길다" * 60}]},
    ],
    ids=["text", "not-list", "not-dict", "no-reason", "unknown-key", "blank", "too-long"],
)
def test_bad_llm_reply_falls_back_to_rule_sentence(client, llm, reply):
    llm.mock(return_value=llm_response(reply))
    data = post(client, candidatePlaces=ONE_CANDIDATE)
    assert places_of(data)[0]["reason"] == RULE_SENTENCE


def test_rule_sentence_uses_the_most_shared_taste_with_correct_particle(client, llm):
    llm.mock(return_value=httpx.Response(500))
    data = post(
        client,
        members=[
            member("a", explicit=["바다"]),
            member("b", explicit=["바다"]),
            member("c", explicit=["휴식"]),
        ],
        candidatePlaces=[place("c1", category=SEA)],
    )
    assert places_of(data)[0]["reason"] == "바다를 고른 두 사람에게 맞아요"


def test_rule_sentence_says_one_person_when_only_one_matches(client, llm):
    llm.mock(return_value=httpx.Response(500))
    data = post(
        client,
        members=[member("a", explicit=["카페"]), member("b", explicit=["바다"])],
        candidatePlaces=[place("c1", category=CAFE)],
    )
    assert places_of(data)[0]["reason"] == "카페를 고른 한 사람에게 맞아요"


def test_llm_is_not_called_without_place_items(client, llm):
    post(client, candidatePlaces=[])
    assert not llm.called


# T-03-9

PARTIAL_MEMBERS = [member("a", "세은", ["맛집"]), member("b", "민준", ["바다"])]
PARTIAL_RULE = "맛집을 고른 한 사람에게 맞아요"


@pytest.mark.parametrize(
    "claim",
    [
        "모두 좋아할 곳이에요",
        "함께 가기 좋아요",
        "다 같이 즐겨요",
        "다같이 즐겨요",
        "다들 좋아해요",
        "모든 분께 맞아요",
        "전원이 좋아해요",
        "취향이 겹쳐요",
        "두 사람에게 맞아요",
    ],
)
def test_false_agreement_is_replaced_when_only_some_match(client, llm, claim):
    llm_says(llm, claim)
    data = post(client, members=PARTIAL_MEMBERS, candidatePlaces=ONE_CANDIDATE)
    assert places_of(data)[0]["reason"] == PARTIAL_RULE


def test_member_without_taste_makes_the_match_partial(client, llm):
    llm_says(llm, "모두 좋아할 곳이에요")
    data = post(client, members=[*TWO_MEMBERS, member("c", "지호")], candidatePlaces=ONE_CANDIDATE)
    assert places_of(data)[0]["reason"] == RULE_SENTENCE


def test_agreement_is_kept_when_everyone_matches(client, llm):
    llm_says(llm, "두 사람 모두 좋아할 맛집이에요")
    data = post(client, candidatePlaces=ONE_CANDIDATE)
    assert places_of(data)[0]["reason"] == "두 사람 모두 좋아할 맛집이에요"


def test_wrong_head_count_is_replaced(client, llm):
    llm_says(llm, "세 사람에게 맞아요")
    data = post(client, candidatePlaces=ONE_CANDIDATE)
    assert places_of(data)[0]["reason"] == RULE_SENTENCE


def test_taste_that_did_not_match_is_replaced(client, llm):
    llm_says(llm, "바다 취향에 맞아요")
    data = post(client, candidatePlaces=ONE_CANDIDATE)
    assert places_of(data)[0]["reason"] == RULE_SENTENCE


def test_matched_alias_becomes_nickname(client, llm):
    llm_says(llm, "M1, M2의 맛집 취향에 맞아요")
    data = post(client, candidatePlaces=ONE_CANDIDATE)
    assert places_of(data)[0]["reason"] == "세은, 민준의 맛집 취향에 맞아요"


def test_alias_of_unmatched_member_is_replaced(client, llm):
    llm_says(llm, "M2의 맛집 취향에 맞아요")
    data = post(client, members=PARTIAL_MEMBERS, candidatePlaces=ONE_CANDIDATE)
    assert places_of(data)[0]["reason"] == PARTIAL_RULE


# 공통 계약


def test_requires_internal_token(client, llm):
    response = client.post(PATH, json=body(), headers={"X-Internal-Token": "wrong"})
    assert response.status_code == 401


def test_invalid_body_is_rejected(client, llm):
    request = body()
    del request["members"]
    assert client.post(PATH, json=request).status_code == 400
