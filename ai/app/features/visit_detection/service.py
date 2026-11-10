"""사진 위치로 방문 후보 찾기 (spec §8.2). 규칙만 쓰고 외부 호출은 없다."""

from datetime import date, datetime, timedelta, timezone

from pydantic import Field

from app.clients.kakao_routing import Coordinate, straight_line_meters
from app.core.schemas import CamelModel
from app.features.weather_alternatives.service import ItineraryItem

# S45 판정 기준을 백엔드와 합의하면 이 값만 바꾼다
VISIT_RADIUS_METERS = 300
KST = timezone(timedelta(hours=9))


class VisitPhoto(CamelModel):
    photo_id: str
    uploader_member_id: str
    captured_at: datetime | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class VisitDetectionRequest(CamelModel):
    trip_start_date: date
    photos: list[VisitPhoto]
    items: list[ItineraryItem]


class VisitCandidate(CamelModel):
    member_id: str
    place_id: str
    visited_at: datetime
    evidence_photo_ids: list[str]


class VisitDetectionResult(CamelModel):
    candidates: list[VisitCandidate]


def detect_visits(body: VisitDetectionRequest) -> VisitDetectionResult:
    groups: dict[tuple[str, str], list[VisitPhoto]] = {}
    for photo in sorted(_usable(body.photos), key=_taken_at):
        place_id = _matching_place(photo, body.items, body.trip_start_date)
        if place_id is not None:
            groups.setdefault((photo.uploader_member_id, place_id), []).append(photo)

    candidates = [
        VisitCandidate(
            member_id=member_id,
            place_id=place_id,
            visited_at=photos[0].captured_at,
            evidence_photo_ids=[photo.photo_id for photo in photos],
        )
        for (member_id, place_id), photos in groups.items()
    ]
    return VisitDetectionResult(candidates=candidates)


def _usable(photos: list[VisitPhoto]) -> list[VisitPhoto]:
    """위치나 시각이 없으면 언제 어디에 있었는지 말할 수 없어 쓰지 않는다."""
    return [
        photo
        for photo in photos
        if photo.latitude is not None
        and photo.longitude is not None
        and photo.captured_at is not None
    ]


def _matching_place(photo: VisitPhoto, items: list[ItineraryItem], start: date) -> str | None:
    """같은 날 코스에서 먼저 찾고, 없으면 날짜와 상관없이 찾는다."""
    taken_on = _taken_at(photo).date()
    same_day = [item for item in items if start + timedelta(days=item.day - 1) == taken_on]
    return _nearest(photo, same_day) or _nearest(photo, items)


def _nearest(photo: VisitPhoto, items: list[ItineraryItem]) -> str | None:
    position = Coordinate(latitude=photo.latitude, longitude=photo.longitude)
    distances = [
        (
            straight_line_meters(
                position,
                Coordinate(latitude=item.place.latitude, longitude=item.place.longitude),
            ),
            item.place.id,
        )
        for item in items
    ]
    inside = [pair for pair in distances if pair[0] <= VISIT_RADIUS_METERS]
    return min(inside, key=lambda pair: pair[0])[1] if inside else None


def _taken_at(photo: VisitPhoto) -> datetime:
    """코스 날짜는 한국 날짜다. 시간대가 없는 값도 한국 시각으로 본다."""
    taken = photo.captured_at
    return taken.replace(tzinfo=KST) if taken.tzinfo is None else taken.astimezone(KST)
