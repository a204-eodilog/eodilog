"""좋아요 기반 추천과 친구 추천 (spec §9). 규칙 점수만 쓰고 외부 호출은 없다."""

from collections.abc import Iterable
from typing import Literal

from pydantic import Field

from app.core.schemas import ApiError, CamelModel
from app.core.text import normalize

DEFAULT_LIMIT = 10
SIMILAR_REASON = "좋아요한 여행과 비슷해요"
TAG_WEIGHT = 2
REGION_WEIGHT = 2
CATEGORY_WEIGHT = 1
TASTE_WEIGHT = 2
TRIP_WEIGHT = 0.5
MAX_COUNTED_TRIPS = 5

ItemType = Literal["FEED", "PLACE"]


class DiscoveryEntry(CamelModel):
    type: ItemType
    id: str
    region_name: str | None = None
    tags: list[str] = []
    place_categories: list[str] = []


class DiscoveryRequest(CamelModel):
    liked: list[DiscoveryEntry]
    candidates: list[DiscoveryEntry]
    limit: int = Field(default=DEFAULT_LIMIT, ge=1)


class DiscoveryItem(CamelModel):
    type: ItemType
    feed_id: str | None
    place_id: str | None
    reason: str


class DiscoveryResult(CamelModel):
    items: list[DiscoveryItem]


class FollowCandidate(CamelModel):
    user_id: str
    public_tastes: list[str] = []
    public_trip_count: int = Field(default=0, ge=0)


class FollowRequest(CamelModel):
    user_id: str
    my_public_tastes: list[str] = []
    candidates: list[FollowCandidate]
    limit: int = Field(default=DEFAULT_LIMIT, ge=1)


class FollowItem(CamelModel):
    user_id: str
    reason: str


class FollowResult(CamelModel):
    items: list[FollowItem]


def recommend_similar(request: DiscoveryRequest) -> DiscoveryResult:
    if not request.liked:
        raise ApiError(422, "INSUFFICIENT_DATA", "좋아요한 항목이 없습니다.")

    liked_tags = _keys(tag for entry in request.liked for tag in entry.tags)
    liked_regions = {region for entry in request.liked if (region := _province(entry.region_name))}
    liked_categories = _keys(name for entry in request.liked for name in entry.place_categories)
    seen = {(entry.type, entry.id) for entry in request.liked}

    scored: list[tuple[int, DiscoveryEntry]] = []
    for candidate in request.candidates:
        if (candidate.type, candidate.id) in seen:
            continue
        seen.add((candidate.type, candidate.id))
        score = (
            len(_keys(candidate.tags) & liked_tags) * TAG_WEIGHT
            + (REGION_WEIGHT if _province(candidate.region_name) in liked_regions else 0)
            + (CATEGORY_WEIGHT if _keys(candidate.place_categories) & liked_categories else 0)
        )
        if score:
            scored.append((score, candidate))

    # sorted는 안정 정렬이라 점수가 같으면 백엔드가 준 순서를 지킨다
    best = sorted(scored, key=lambda pair: -pair[0])[: request.limit]
    return DiscoveryResult(items=[_discovery_item(candidate) for _, candidate in best])


def suggest_follows(request: FollowRequest) -> FollowResult:
    seen = {request.user_id}
    scored: list[tuple[float, FollowItem]] = []
    for candidate in request.candidates:
        if candidate.user_id in seen:
            continue
        seen.add(candidate.user_id)
        theirs = _keys(candidate.public_tastes)
        shared = _unique(taste for taste in request.my_public_tastes if normalize(taste) in theirs)
        trips = candidate.public_trip_count
        score = len(shared) * TASTE_WEIGHT + min(trips, MAX_COUNTED_TRIPS) * TRIP_WEIGHT
        if score:
            scored.append(
                (score, FollowItem(user_id=candidate.user_id, reason=_reason(shared, trips)))
            )

    best = sorted(scored, key=lambda pair: -pair[0])[: request.limit]
    return FollowResult(items=[item for _, item in best])


def _discovery_item(candidate: DiscoveryEntry) -> DiscoveryItem:
    return DiscoveryItem(
        type=candidate.type,
        feed_id=candidate.id if candidate.type == "FEED" else None,
        place_id=candidate.id if candidate.type == "PLACE" else None,
        reason=SIMILAR_REASON,
    )


def _reason(shared: list[str], trips: int) -> str:
    if shared:
        return f"공개 취향이 같아요 · {', '.join(shared)}"
    return f"공개 여행 {trips}개를 올렸어요"


def _keys(names: Iterable[str]) -> set[str]:
    return {key for name in names if (key := normalize(name))}


def _unique(names: Iterable[str]) -> list[str]:
    """정규화한 이름이 같으면 처음 나온 표기만 남긴다."""
    by_key: dict[str, str] = {}
    for name in names:
        by_key.setdefault(normalize(name), name.strip())
    return list(by_key.values())


def _province(region_name: str | None) -> str | None:
    """`강원 강릉`의 앞 단어가 시·도다."""
    words = (region_name or "").split()
    return normalize(words[0]) if words else None
