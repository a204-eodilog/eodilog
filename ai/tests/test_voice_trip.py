"""말로 새 여행 만들기 (실험). 쭉 말한 여행 계획 → 여행 정보 + 코스 초안, 말로 고치기, 후보 찾기.

LLM·받아쓰기·장소 검색은 가짜로 바꿔 규칙만 확인한다.
"""

import json
import time
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.clients.naver_local import ProviderPlace
from app.clients.stt import Transcription
from app.core.config import Settings
from app.features.voice_trip.service import (
    TripDraft,
    VoiceTripMaker,
    describe_changes,
)
from app.main import create_app

TODAY = date(2026, 11, 16)


class FakeLlm:
    def __init__(self, reply: dict):
        self.reply = reply
        self.calls: list[tuple[str, str]] = []

    async def chat_json(self, system: str, user: str, images_jpeg=None) -> dict:
        self.calls.append((system, user))
        return self.reply


class FakePlaces:
    def __init__(self, found: dict[str, list[ProviderPlace]]):
        self.found = found
        self.queries: list[str] = []

    async def search(self, query: str, size: int = 3) -> list[ProviderPlace]:
        self.queries.append(query)
        for key, places in self.found.items():
            if key in query:
                return places
        return []


class FakeStt:
    def __init__(self, text: str):
        self.text = text

    async def transcribe(self, audio: bytes, *, hints: list[str]) -> Transcription:
        return Transcription(self.text, 240.0)


def place(name: str, lat: float = 35.16, lng: float = 129.16) -> ProviderPlace:
    return ProviderPlace(
        name=name,
        address="부산 해운대구",
        latitude=lat,
        longitude=lng,
        provider="NAVER",
        provider_place_id="h-" + name,
        category="음식점",
    )


EXTRACTED = {
    "title": None,
    "suggestedTitle": "친구들과 부산 2박 3일",
    "destinations": [{"name": "부산", "said": "부산 가려고"}],
    "startDate": "2026-11-20",
    "endDate": "2026-11-22",
    "datesSaid": "11월 20일부터 2박 3일",
    "dayCount": 3,
    "items": [
        {"day": 1, "said": "해운대 먼저 가고", "search": "해운대해수욕장", "kind": "name"},
        {
            "day": 1,
            "said": "12시쯤 해운대 근처 돼지국밥",
            "search": "해운대 돼지국밥",
            "kind": "type",
            "label": "점심",
            "time": "12시",
        },
        {
            "day": 1,
            "said": "저녁은 민락동에서 회",
            "search": "민락동 횟집",
            "kind": "type",
            "label": "저녁",
            "time": "18:00",
        },
        {"day": 2, "said": "없는 가게", "search": "없는가게", "kind": "name"},
        {"day": 7, "said": "범위 밖", "search": "범위밖장소", "kind": "name"},
    ],
}

FOUND = {
    "해운대해수욕장": [place("해운대해수욕장")],
    "돼지국밥": [place("해운대 오복돼지국밥"), place("해운대 할매국밥")],
    "횟집": [place("민락회센터")],
}


def maker(reply: dict, found: dict | None = None) -> tuple[VoiceTripMaker, FakeLlm, FakePlaces]:
    llm = FakeLlm(reply)
    places = FakePlaces(FOUND if found is None else found)
    return VoiceTripMaker(llm=llm, places=places), llm, places


async def test_draft_keeps_only_what_was_said():
    m, llm, _ = maker(EXTRACTED)
    draft = await m.draft("받아쓴 말", today=TODAY)

    assert draft.title == "친구들과 부산 2박 3일"
    assert draft.title_by_ai is True
    assert [d.name for d in draft.destinations] == ["부산"]
    assert draft.start_date == date(2026, 11, 20)
    assert draft.end_date == date(2026, 11, 22)
    assert draft.day_count == 3
    # 7일차는 기간 밖이라 버린다. 못 찾은 가게도 칸은 남기고 장소만 비운다
    assert [(i.day, i.query) for i in draft.items] == [
        (1, "해운대해수욕장"),
        (1, "해운대 돼지국밥"),
        (1, "민락동 횟집"),
        (2, "없는가게"),
    ]
    sea, soup, fish, missing = draft.items
    assert sea.place.name == "해운대해수욕장" and sea.ai_picked is False
    # 종류만 말했으면 AI가 하나 고른 곳
    assert soup.place.name == "해운대 오복돼지국밥" and soup.ai_picked is True
    assert soup.start_time == "12:00"
    assert soup.label == "점심"
    assert fish.start_time == "18:00"
    assert missing.place is None
    assert len({i.key for i in draft.items}) == 4
    # 오늘 날짜를 알려 연도 없는 날짜를 풀게 하고, 받아쓴 말은 JSON 문자열로 넘긴다
    assert "2026-11-16" in llm.calls[0][1]
    assert json.dumps("받아쓴 말", ensure_ascii=False) in llm.calls[0][1]


async def test_draft_without_dates_uses_said_day_count():
    reply = {
        **EXTRACTED,
        "startDate": None,
        "endDate": None,
        "datesSaid": None,
        "dayCount": None,
        "title": "바다 여행",
    }
    m, _, _ = maker(reply)
    draft = await m.draft("말", today=TODAY)

    assert draft.start_date is None and draft.end_date is None
    # 날짜가 없으면 말한 가장 늦은 날까지(최대 10일)
    assert draft.day_count == 7
    assert draft.title == "바다 여행" and draft.title_by_ai is False


async def test_draft_rejects_backwards_or_too_long_dates():
    reply = {**EXTRACTED, "startDate": "2026-11-22", "endDate": "2026-11-20", "items": []}
    m, _, _ = maker(reply)
    draft = await m.draft("말", today=TODAY)
    assert draft.start_date is None and draft.end_date is None

    reply = {**EXTRACTED, "startDate": "2026-11-01", "endDate": "2026-12-30", "items": []}
    m, _, _ = maker(reply)
    draft = await m.draft("말", today=TODAY)
    assert draft.start_date is None


async def test_draft_names_trip_when_llm_gives_no_title():
    reply = {**EXTRACTED, "title": None, "suggestedTitle": None, "items": []}
    m, _, _ = maker(reply)
    draft = await m.draft("말", today=TODAY)
    assert draft.title == "부산 2박 3일"
    assert draft.title_by_ai is True


async def test_draft_searches_with_destination_when_area_missing():
    reply = {
        **EXTRACTED,
        "items": [{"day": 1, "said": "오복돼지국밥", "search": "오복돼지국밥", "kind": "name"}],
    }
    m, _, places = maker(reply, {"오복": [place("오복돼지국밥 해운대점")]})
    await m.draft("말", today=TODAY)
    assert places.queries[0] == "부산 오복돼지국밥"


async def test_fix_applies_only_valid_ops_and_describes_them():
    m, _, _ = maker(EXTRACTED)
    draft = await m.draft("말", today=TODAY)
    soup_key = draft.items[1].key

    m2, llm, _ = maker(
        {
            "ops": [
                {"op": "setDates", "startDate": "2026-11-21", "endDate": "2026-11-23"},
                {
                    "op": "add",
                    "day": 2,
                    "search": "남포동 밀면",
                    "kind": "type",
                    "label": "점심",
                    "time": "12:30",
                    "said": "둘째 날 점심은 남포동에서 밀면",
                },
                {"op": "remove", "key": "없는-key"},
                {"op": "setTime", "key": soup_key, "time": "13:00"},
                {"op": "move", "key": soup_key, "day": 9},
                {"op": "setTitle", "title": "부산 먹방"},
            ]
        },
        {"밀면": [place("남포동 할매밀면")]},
    )
    result = await m2.fix(draft, "날짜 하루 미루고 둘째 날 점심 밀면", today=TODAY)

    kinds = [op.op for op in result.ops]
    assert kinds == ["setDates", "add", "setTime", "setTitle"]
    add = result.ops[1]
    assert add.place.name == "남포동 할매밀면" and add.ai_picked is True
    assert add.key and add.start_time == "12:30"
    assert result.changes == [
        "날짜 11.21(토) ~ 11.23(월)",
        "2일차 점심에 남포동 할매밀면 넣기",
        "해운대 오복돼지국밥 13:00로",
        "이름 '부산 먹방'으로",
    ]
    assert json.dumps("날짜 하루 미루고 둘째 날 점심 밀면", ensure_ascii=False) in llm.calls[0][1]


async def test_fix_reports_place_it_could_not_find():
    m, _, _ = maker(EXTRACTED)
    draft = await m.draft("말", today=TODAY)
    m2, _, _ = maker({"ops": [{"op": "add", "day": 1, "search": "없는집", "kind": "name"}]}, {})
    result = await m2.fix(draft, "없는집 넣어 줘", today=TODAY)
    assert result.ops == []
    assert result.changes == ["'없는집'은 지도에서 찾지 못했어요"]


def test_describe_changes_for_replace_and_remove():
    draft = TripDraft.model_validate(
        {
            "title": "t",
            "titleByAi": False,
            "destinations": [],
            "dayCount": 2,
            "transcript": "",
            "items": [
                {"key": "a", "day": 1, "query": "카페", "place": place("카페 해목").model_dump()},
                {"key": "b", "day": 1, "query": "회", "place": None},
            ],
        }
    )
    from app.features.voice_trip.service import FixOp

    ops = [
        FixOp(op="remove", key="a"),
        FixOp(op="move", key="b", day=2),
        FixOp(op="setDestinations", names=["부산", "경주"]),
    ]
    assert describe_changes(draft, ops) == [
        "카페 해목 빼기",
        "회 2일차로 옮기기",
        "여행지 부산, 경주",
    ]


async def test_candidates_sorted_by_distance_from_near():
    near = place("A", 35.0, 129.0)
    far = place("B", 35.2, 129.0)
    m, _, _ = maker({}, {"카페": [far, near]})
    found = await m.candidates("광안리 카페", destination="부산", near=(35.0, 129.0))
    assert [c.place.name for c in found] == ["A", "B"]
    assert found[0].distance_meters == 0


# ---------- API ----------


@pytest.fixture
def client():
    app = create_app(Settings(internal_api_token="t", gms_api_key="", naver_client_id=""))
    llm = FakeLlm(EXTRACTED)
    app.state.voice_trip_maker = VoiceTripMaker(llm=llm, places=FakePlaces(FOUND))
    app.state.voice_trip_stt = FakeStt("부산 2박 3일 가려고")
    with TestClient(app, headers={"X-Internal-Token": "t"}) as c:
        yield c


def wait_job(client: TestClient, job_id: str) -> dict:
    for _ in range(50):
        body = client.get(f"/ai/v1/voice-trip/jobs/{job_id}").json()["data"]
        if body["status"] != "RUNNING":
            return body
        time.sleep(0.02)
    raise AssertionError("작업이 끝나지 않았다")


def test_job_from_text_returns_draft(client):
    res = client.post("/ai/v1/voice-trip/jobs", data={"text": "부산 2박 3일 가려고"})
    assert res.status_code == 202
    job = wait_job(client, res.json()["data"]["jobId"])
    assert job["status"] == "SUCCEEDED"
    assert job["step"] == "DONE"
    assert job["draft"]["title"] == "친구들과 부산 2박 3일"
    assert job["draft"]["transcript"] == "부산 2박 3일 가려고"
    assert job["draft"]["items"][1]["aiPicked"] is True


def test_job_rejects_bad_audio(client):
    res = client.post(
        "/ai/v1/voice-trip/jobs", files={"audio": ("a.m4a", b"not audio", "audio/mp4")}
    )
    assert res.status_code == 400


def test_job_requires_input(client):
    assert client.post("/ai/v1/voice-trip/jobs", data={}).status_code == 400


def test_unknown_job_is_404(client):
    assert client.get("/ai/v1/voice-trip/jobs/nope").status_code == 404


def test_fix_endpoint(client):
    job = wait_job(
        client, client.post("/ai/v1/voice-trip/jobs", data={"text": "말"}).json()["data"]["jobId"]
    )
    client.app.state.voice_trip_maker = VoiceTripMaker(
        llm=FakeLlm({"ops": [{"op": "setTitle", "title": "새 이름"}]}), places=FakePlaces({})
    )
    res = client.post(
        "/ai/v1/voice-trip/fixes",
        data={"draft": json.dumps(job["draft"], ensure_ascii=False), "text": "이름 바꿔"},
    )
    assert res.status_code == 200
    body = res.json()["data"]
    assert body["transcript"] == "이름 바꿔"
    assert body["ops"][0]["op"] == "setTitle"
    assert body["changes"] == ["이름 '새 이름'으로"]


def test_candidates_endpoint(client):
    res = client.post(
        "/ai/v1/voice-trip/candidates",
        json={
            "query": "해운대 돼지국밥",
            "destination": "부산",
            "near": {"latitude": 35.16, "longitude": 129.16},
        },
    )
    assert res.status_code == 200
    names = [c["place"]["name"] for c in res.json()["data"]]
    assert names == ["해운대 오복돼지국밥", "해운대 할매국밥"]
