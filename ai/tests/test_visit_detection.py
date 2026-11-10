"""VISIT_DETECTION (spec §8.2, T-08-7 ~ T-08-10). 규칙만 쓰고 외부 호출은 없다."""

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

PATH = "/ai/v1/visit-detections"
TOKEN = "secret-token"
START = "2026-11-14"
LAT, LNG = 35.15, 129.16
# 위도 1도는 약 111km다
METERS_100 = 0.0009
METERS_250 = 0.00225
METERS_350 = 0.00315
KM_2 = 0.018


@pytest.fixture
def client() -> TestClient:
    settings = Settings(_env_file=None, internal_api_token=TOKEN)
    test_client = TestClient(create_app(settings), raise_server_exceptions=False)
    test_client.headers["X-Internal-Token"] = TOKEN
    return test_client


def item(place_id: str, day: int = 1, lat: float = LAT, lng: float = LNG) -> dict:
    return {
        "place": {"id": place_id, "name": place_id, "latitude": lat, "longitude": lng},
        "day": day,
        "order": 1,
    }


def photo(
    photo_id: str,
    member: str = "m1",
    at: str | None = "2026-11-14T10:00:00+09:00",
    lat: float | None = LAT,
    lng: float | None = LNG,
) -> dict:
    return {
        "photoId": photo_id,
        "uploaderMemberId": member,
        "capturedAt": at,
        "latitude": lat,
        "longitude": lng,
    }


def detect(client: TestClient, photos: list[dict], items: list[dict]) -> list[dict]:
    body = {"tripStartDate": START, "photos": photos, "items": items}
    response = client.post(PATH, json=body)
    assert response.status_code == 200, response.text
    return response.json()["data"]["candidates"]


def pairs(candidates: list[dict]) -> list[tuple[str, str]]:
    return [(c["memberId"], c["placeId"]) for c in candidates]


def test_t08_7_photo_within_100m_on_the_same_day_is_a_candidate(client):
    found = detect(client, [photo("p1", lat=LAT + METERS_100)], [item("a")])

    assert found == [
        {
            "memberId": "m1",
            "placeId": "a",
            "visitedAt": "2026-11-14T10:00:00+09:00",
            "evidencePhotoIds": ["p1"],
        }
    ]


def test_t08_8_photo_2km_away_is_not_a_candidate(client):
    assert detect(client, [photo("p1", lat=LAT + KM_2)], [item("a")]) == []


@pytest.mark.parametrize(
    "location",
    [{"lat": None, "lng": None}, {"lat": LAT, "lng": None}, {"lat": None, "lng": LNG}],
    ids=["none", "no-longitude", "no-latitude"],
)
def test_t08_9_photo_without_location_is_ignored(client, location):
    assert detect(client, [photo("p1", **location)], [item("a")]) == []


def test_t08_10_uploaders_are_separate_candidates(client):
    found = detect(client, [photo("p1", "m1"), photo("p2", "m2")], [item("a")])

    assert sorted(pairs(found)) == [("m1", "a"), ("m2", "a")]
    assert {c["memberId"]: c["evidencePhotoIds"] for c in found} == {"m1": ["p1"], "m2": ["p2"]}


def test_photo_at_250m_counts_but_350m_does_not(client):
    assert pairs(detect(client, [photo("p1", lat=LAT + METERS_250)], [item("a")])) == [("m1", "a")]
    assert detect(client, [photo("p1", lat=LAT + METERS_350)], [item("a")]) == []


def test_same_day_place_wins_over_a_nearer_place_of_another_day(client):
    photos = [photo("p1", lat=LAT + METERS_100)]
    items = [item("other-day", day=2, lat=LAT + METERS_100), item("same-day", day=1)]

    assert pairs(detect(client, photos, items)) == [("m1", "same-day")]


def test_nearest_place_of_the_same_day_is_chosen(client):
    photos = [photo("p1", lat=LAT + METERS_100)]
    items = [item("far", lat=LAT + METERS_250), item("near", lat=LAT + METERS_100)]

    assert pairs(detect(client, photos, items)) == [("m1", "near")]


def test_any_day_place_is_used_when_the_same_day_has_none_nearby(client):
    photos = [photo("p1")]
    items = [item("same-day-far", day=1, lat=LAT + KM_2), item("other-day", day=2)]

    assert pairs(detect(client, photos, items)) == [("m1", "other-day")]


def test_photos_of_a_member_and_place_merge_with_the_earliest_time(client):
    photos = [
        photo("late", at="2026-11-14T15:00:00+09:00"),
        photo("early", at="2026-11-14T09:00:00+09:00"),
    ]

    found = detect(client, photos, [item("a")])

    assert len(found) == 1
    assert found[0]["visitedAt"] == "2026-11-14T09:00:00+09:00"
    assert found[0]["evidencePhotoIds"] == ["early", "late"]


def test_same_place_on_two_days_gives_one_candidate(client):
    photos = [photo("p1"), photo("p2", at="2026-11-15T10:00:00+09:00")]

    found = detect(client, photos, [item("a", day=1), item("a", day=2)])

    assert pairs(found) == [("m1", "a")]
    assert found[0]["evidencePhotoIds"] == ["p1", "p2"]


def test_day_is_decided_in_korean_time_for_utc_timestamps(client):
    # 11월 14일 23시(UTC)는 한국의 11월 15일 08시, 즉 2일차다
    photos = [photo("p1", at="2026-11-14T23:00:00Z")]
    items = [item("day1", day=1), item("day2", day=2)]

    assert pairs(detect(client, photos, items)) == [("m1", "day2")]


def test_earliest_time_compares_mixed_offsets(client):
    photos = [
        photo("utc", at="2026-11-14T00:30:00Z"),
        photo("kst", at="2026-11-14T08:00:00+09:00"),
    ]

    found = detect(client, photos, [item("a")])

    assert found[0]["evidencePhotoIds"] == ["kst", "utc"]


def test_photo_without_capture_time_is_ignored(client):
    assert detect(client, [photo("p1", at=None)], [item("a")]) == []


def test_no_photos_or_items_returns_no_candidates(client):
    assert detect(client, [], [item("a")]) == []
    assert detect(client, [photo("p1")], []) == []


def test_invalid_coordinate_is_rejected(client):
    body = {"tripStartDate": START, "photos": [photo("p1", lat=91.0)], "items": [item("a")]}

    assert client.post(PATH, json=body).status_code == 400


def test_token_is_required(client):
    client.headers.pop("X-Internal-Token")

    assert client.post(PATH, json={}).status_code == 401
