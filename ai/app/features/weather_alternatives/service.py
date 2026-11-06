"""비 오는 시간의 실외 일정에 대안을 낸다 (spec §6, 화면 S26).

날씨 수치와 영업 정보는 입력값만, 이동 시간은 길찾기 공급자 값만 쓴다. LLM은 쓰지 않는다.
"""

import asyncio
import logging
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from pydantic import Field

from app.clients.kakao_routing import (
    Coordinate,
    KakaoRoutingClient,
    RouteLeg,
    TransportMode,
    straight_line_meters,
)
from app.core.schemas import ApiError, CamelModel, ErrorField

log = logging.getLogger("ai")

RAIN_PROBABILITY = 0.6  # AS-6
# 시간별 예보는 UTC, 일정 시각은 한국 시각이다 (spec §1)
KST = timezone(timedelta(hours=9))
HOUR = 60
# 머무는 시간을 모르면 한 시간으로 본다. 옮긴 일정은 하루 일정 끝(AS-5 21:00) 안에 끝나야 한다
DEFAULT_STAY_MINUTES = HOUR
DAY_END_MINUTES = 21 * HOUR
MAX_PLACE_SWAPS = 3
# 이 거리 안의 후보는 도보 시간으로 알려 준다 (AS-6). 그보다 멀면 기본 이동 수단
WALKABLE_METERS = 1200
MODE_LABELS = {
    TransportMode.WALK: "도보",
    TransportMode.CAR: "자동차",
    TransportMode.TRANSIT: "대중교통",
}

# spec §1.1 실내 여부. 분류 표기의 '>'·',' 조각 단위로 찾는다.
# 실내 시설 낱말을 먼저 본다. '여행,명소>아쿠아리움'처럼 일반 낱말 '명소'가 같이 있어도 실내다.
# 전통 '시장'은 바깥인 곳이 많아 어느 쪽에도 넣지 않는다 (모름)
INDOOR_WORDS = (
    "카페",
    "음식점",
    "숙박",
    "쇼핑",
    "백화점",
    "아쿠아리움",
    "수족관",
    "박물관",
    "미술관",
    "전시관",
    "기념관",
    "과학관",
    "갤러리",
    "실내",
    "영화관",
    "공연장",
    "도서관",
    "찜질방",
    "스파",
    "키즈카페",
    "볼링",
    "노래방",
    "서점",
)
OUTDOOR_WORDS = ("해수욕장", "해변", "공원", "계곡", "폭포", "둘레길", "관광", "명소")
# '산'은 '부산'·'산책'처럼 다른 낱말에 들어 있어 조각 전체가 '산'일 때만 실외로 본다
OUTDOOR_SEGMENTS = ("산",)

TIME_PATTERN = r"^([01][0-9]|2[0-3]):[0-5][0-9]$"


class Place(CamelModel):
    id: str
    name: str
    address: str | None = None
    latitude: float
    longitude: float
    region_id: str | None = None
    provider: str | None = None
    provider_place_id: str | None = None
    source: str | None = None
    category: str | None = None


class ItineraryItem(CamelModel):
    id: str | None = None
    place: Place
    day: int
    order: int
    start_time: str | None = Field(default=None, pattern=TIME_PATTERN)
    stay_minutes: int | None = Field(default=None, ge=0)


class HourlyWeather(CamelModel):
    at: datetime
    condition: str
    temperature_celsius: float | None = None
    precipitation_probability: float | None = Field(default=None, ge=0, le=1)


class Weather(CamelModel):
    place_id: str
    date: date
    queried_at: datetime
    forecast_at: datetime
    source: str
    condition: str
    temperature_celsius: float | None = None
    min_celsius: float | None = None
    max_celsius: float | None = None
    precipitation_probability: float | None = Field(default=None, ge=0, le=1)
    hourly: list[HourlyWeather] = []
    stale: bool


class OpenStatus(CamelModel):
    value: Literal["OPEN", "CLOSED", "UNKNOWN"]
    checked_at: datetime | None = None


class PoolEntry(CamelModel):
    place: Place
    open_status: OpenStatus


class WeatherAlternativesRequest(CamelModel):
    date: date
    place_id: str
    expected_version: int
    weather: Weather
    day_items: list[ItineraryItem]
    alternative_pool: list[PoolEntry] = []
    default_transport_mode: TransportMode = TransportMode.TRANSIT


class Alternative(CamelModel):
    alternative_id: str
    type: Literal["TIME_SHIFT", "PLACE_SWAP", "INFO"]
    place: Place | None
    item_id: str | None
    target_start_time: str | None
    activity: str
    reason: str


class WeatherAlternativesResult(CamelModel):
    alternatives: list[Alternative]
    weather: Weather
    base_version: int


@dataclass(frozen=True)
class Span:
    """그날 0시부터 센 분. 끝은 포함하지 않는다."""

    start: int
    end: int

    def overlaps(self, other: "Span") -> bool:
        return self.start < other.end and other.start < self.end


class WeatherAlternativeSuggester:
    def __init__(self, *, routing: KakaoRoutingClient):
        self._routing = routing

    async def suggest(self, request: WeatherAlternativesRequest) -> WeatherAlternativesResult:
        return WeatherAlternativesResult(
            alternatives=await self._alternatives(request),
            weather=request.weather,
            base_version=request.expected_version,
        )

    async def _alternatives(self, request: WeatherAlternativesRequest) -> list[Alternative]:
        target = _target_item(request)
        if target.start_time is None:
            return []
        if is_outdoor(target.place.category) is not True:
            return []
        forecast = _hourly_by_minute(request.weather, request.date)
        visit = _span(target)
        rain_hours = [hour for hour, p in forecast.items() if _is_rain(p)]
        if not any(visit.overlaps(Span(hour, hour + HOUR)) for hour in rain_hours):
            return []

        found: list[Alternative] = []
        shift = _time_shift(target, visit, forecast, request.day_items)
        if shift is not None:
            found.append(shift)
        found.extend(await self._place_swaps(target, request))
        # 옮길 시간도 바꿀 장소도 없으면 준비물만 알린다. 코스는 바꿀 수 없다
        return found or [_info()]

    async def _place_swaps(
        self, target: ItineraryItem, request: WeatherAlternativesRequest
    ) -> list[Alternative]:
        """실내이고 닫지 않은 후보 중 가까운 순 최대 3곳 (spec §6 PLACE_SWAP)."""
        origin = _coordinate(target.place)
        chosen = _swap_candidates(request)
        chosen.sort(key=lambda entry: straight_line_meters(origin, _coordinate(entry.place)))
        chosen = chosen[:MAX_PLACE_SWAPS]
        legs = await asyncio.gather(
            *(self._leg(origin, entry.place, request.default_transport_mode) for entry in chosen)
        )
        return [
            Alternative(
                alternative_id=str(uuid.uuid4()),
                type="PLACE_SWAP",
                place=entry.place,
                item_id=target.id,
                target_start_time=None,
                activity=entry.place.name,
                reason=f"{_travel_text(leg)} · {_open_text(entry.open_status)}",
            )
            for entry, leg in zip(chosen, legs, strict=True)
        ]

    async def _leg(self, origin: Coordinate, place: Place, default: TransportMode) -> RouteLeg:
        destination = _coordinate(place)
        near = straight_line_meters(origin, destination) <= WALKABLE_METERS
        return await self._routing.leg(origin, destination, TransportMode.WALK if near else default)


def _info() -> Alternative:
    return Alternative(
        alternative_id=str(uuid.uuid4()),
        type="INFO",
        place=None,
        item_id=None,
        target_start_time=None,
        activity="우산과 우비 챙기기",
        reason="가까운 실내 대안이 없어요",
    )


def _swap_candidates(request: WeatherAlternativesRequest) -> list[PoolEntry]:
    """그날 이미 가는 장소와 같은 장소를 두 번 내지 않는다."""
    seen = {item.place.id for item in request.day_items}
    chosen: list[PoolEntry] = []
    for entry in request.alternative_pool:
        if entry.place.id in seen or entry.open_status.value == "CLOSED":
            continue
        if is_outdoor(entry.place.category) is not False:
            continue
        seen.add(entry.place.id)
        chosen.append(entry)
    return chosen


def _coordinate(place: Place) -> Coordinate:
    return Coordinate(latitude=place.latitude, longitude=place.longitude)


def _travel_text(leg: RouteLeg) -> str:
    if leg.duration_seconds is None:
        return "이동 시간 확인 못 함"
    minutes = max(1, round(leg.duration_seconds / HOUR))
    return f"{MODE_LABELS[leg.transport_mode]} {minutes}분"


def _open_text(status: OpenStatus) -> str:
    if status.value != "OPEN":
        return "영업 정보 없음"
    if status.checked_at is None:
        return "영업 중"
    checked = status.checked_at
    local = checked.astimezone(KST) if checked.tzinfo else checked.replace(tzinfo=KST)
    return f"영업 중({local:%H:%M} 확인)"


def _target_item(request: WeatherAlternativesRequest) -> ItineraryItem:
    """같은 장소가 그날 두 번 있으면 먼저 가는 일정을 대상으로 본다."""
    matches = [item for item in request.day_items if item.place.id == request.place_id]
    if not matches:
        raise ApiError(
            422,
            "INSUFFICIENT_DATA",
            "그날 코스에 날씨 대상 장소가 없습니다.",
            [ErrorField(field="placeId", message="dayItems에 없는 장소입니다.")],
        )
    return min(matches, key=lambda item: item.order)


def _minutes(clock: str) -> int:
    hours, minutes = clock.split(":")
    return int(hours) * HOUR + int(minutes)


def _clock(minutes: int) -> str:
    return f"{minutes // HOUR:02d}:{minutes % HOUR:02d}"


def _span(item: ItineraryItem, start: int | None = None) -> Span:
    begin = _minutes(item.start_time) if start is None else start
    return Span(begin, begin + (item.stay_minutes or DEFAULT_STAY_MINUTES))


def _is_rain(probability: float | None) -> bool:
    return probability is not None and probability >= RAIN_PROBABILITY


def _is_dry(probability: float | None) -> bool:
    return probability is not None and probability < RAIN_PROBABILITY


def _hourly_by_minute(weather: Weather, day: date) -> dict[int, float | None]:
    """그날(한국 시각) 시간별 강수확률. 키는 그 시간이 시작하는 분."""
    forecast: dict[int, float | None] = {}
    for hour in weather.hourly:
        local = hour.at.astimezone(KST) if hour.at.tzinfo else hour.at.replace(tzinfo=KST)
        if local.date() == day:
            forecast[local.hour * HOUR] = hour.precipitation_probability
    return forecast


def _all_dry(span: Span, forecast: dict[int, float | None]) -> bool:
    """예보가 없거나 확률을 모르는 시간은 비가 그쳤다고 말할 수 없어 마른 시간으로 보지 않는다."""
    first = span.start - span.start % HOUR
    return all(_is_dry(forecast.get(hour)) for hour in range(first, span.end, HOUR))


def _time_shift(
    target: ItineraryItem,
    visit: Span,
    forecast: dict[int, float | None],
    day_items: list[ItineraryItem],
) -> Alternative | None:
    """비 그친 뒤 다른 일정과 겹치지 않는 첫 시각 (spec §6 TIME_SHIFT)."""
    others = [_span(item) for item in day_items if item is not target and item.start_time]
    # 가장 이른 빈 시각은 마른 시간이 시작하거나 다른 일정이 끝나는 때다
    starts = {hour for hour, p in forecast.items() if _is_dry(p)} | {o.end for o in others}
    for start in sorted(start for start in starts if start > visit.start):
        moved = _span(target, start)
        if moved.end > DAY_END_MINUTES:
            break
        if _all_dry(moved, forecast) and not any(moved.overlaps(o) for o in others):
            return Alternative(
                alternative_id=str(uuid.uuid4()),
                type="TIME_SHIFT",
                place=None,
                item_id=target.id,
                target_start_time=_clock(start),
                activity=f"{_with_object_particle(target.place.name)} {_spoken(start)} 옮기기",
                reason=f"비 그친 뒤 {_clock(start)} · {_rain_end(visit, forecast) // HOUR}시부터 그쳐요 (예보)",
            )
    return None


def _rain_end(visit: Span, forecast: dict[int, float | None]) -> int:
    """일정과 겹치는 마지막 비 시간부터 이어지는 비가 끝나는 시각."""
    hour = max(h for h, p in forecast.items() if _is_rain(p) and visit.overlaps(Span(h, h + HOUR)))
    while _is_rain(forecast.get(hour + HOUR)):
        hour += HOUR
    return hour + HOUR


def _spoken(minutes: int) -> str:
    """14:00 → '오후 2시로', 14:30 → '오후 2시 30분으로'."""
    hour, minute = divmod(minutes, HOUR)
    period = "오전" if hour < 12 else "오후"
    text = f"{period} {hour % 12 or 12}시"
    return f"{text} {minute}분으로" if minute else f"{text}로"


def _with_object_particle(word: str) -> str:
    """받침이 있으면 '을', 없으면 '를'. 한글로 끝나지 않으면 '을(를)'."""
    last = word[-1] if word else ""
    if not ("가" <= last <= "힣"):
        return f"{word}을(를)"
    return f"{word}을" if (ord(last) - ord("가")) % 28 else f"{word}를"


def is_outdoor(category: str | None) -> bool | None:
    """실내면 False, 실외면 True, 모르면 None (spec §1.1)."""
    if not category:
        return None
    segments = [part.strip() for part in category.replace(">", ",").split(",") if part.strip()]
    if any(word in segment for segment in segments for word in INDOOR_WORDS):
        return False
    if any(word in segment for segment in segments for word in OUTDOOR_WORDS):
        return True
    if any(segment in OUTDOOR_SEGMENTS for segment in segments):
        return True
    return None
