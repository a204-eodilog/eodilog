"""모은 장소로 날짜별 코스를 짜고, 장소 제외·날씨 대안을 반영한다 (spec §5, 화면 S23·S26·S29).

장소는 입력에 있는 것만, 이동 시간은 길찾기 공급자 값만 쓴다. LLM은 쓰지 않는다.
"""

import asyncio
import itertools
import math
import re
from datetime import UTC, date, datetime
from typing import Literal, Self

from pydantic import model_validator

from app.clients.kakao_routing import (
    Coordinate,
    KakaoRoutingClient,
    RouteLeg,
    TransportMode,
    straight_line_meters,
)
from app.core.schemas import ApiError, CamelModel, ErrorField
from app.features.preference_inference.service import FOOD_TOP_WORDS
from app.features.weather_alternatives.service import (
    TIME_PATTERN,
    Alternative,
    ItineraryItem,
    Place,
    _clock,
    _minutes,
    is_outdoor,
)

HOUR = 60
DAY_START_MINUTES = 10 * HOUR  # AS-5
DAY_END_MINUTES = 21 * HOUR
MINUTES_IN_DAY = 24 * HOUR
MEAL_MINUTES = (12 * HOUR, 18 * HOUR)
MAX_PLACES_PER_DAY = 5
CAFE_STAY_MINUTES = 60
RESTAURANT_STAY_MINUTES = 90
SIGHT_STAY_MINUTES = 120
OTHER_STAY_MINUTES = 90
# 구간을 못 구했을 때 다음 일정까지 두는 여유 (AS-5)
UNAVAILABLE_LEG_MINUTES = 30
# 방문 순서를 고를 때만 쓰는 어림값. 실제 시각은 공급자 값으로 계산한다
ESTIMATED_LEG_MINUTES = 15
# is_outdoor가 실내로 보는 곳 중 구경하러 가는 시설
INDOOR_SIGHT_WORDS = (
    "아쿠아리움",
    "수족관",
    "박물관",
    "미술관",
    "전시관",
    "기념관",
    "과학관",
    "갤러리",
)


class Trip(CamelModel):
    id: str
    start_date: date | None = None
    end_date: date | None = None
    destination_region_ids: list[str] = []

    @model_validator(mode="after")
    def end_is_not_before_start(self) -> Self:
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("endDate는 startDate보다 앞설 수 없습니다.")
        return self


class ProposedLeg(CamelModel):
    """백엔드 RouteLeg에는 day·순서가 없어 입력에서는 비어 있을 수 있다."""

    from_item_id: str | None = None
    to_item_id: str | None = None
    day: int | None = None
    from_order: int | None = None
    to_order: int | None = None
    transport_mode: str
    duration_seconds: int | None = None
    distance_meters: int | None = None
    geometry: dict | None = None
    status: Literal["AVAILABLE", "UNAVAILABLE"]
    queried_at: datetime | None = None


class Course(CamelModel):
    items: list[ItineraryItem] = []
    legs: list[ProposedLeg] = []


class ItineraryProposalRequest(CamelModel):
    reason: Literal["INITIAL", "PLACE_REMOVED", "WEATHER"]
    expected_version: int
    trip: Trip
    places: list[Place] = []
    current: Course = Course()
    default_transport_mode: TransportMode = TransportMode.TRANSIT
    excluded_place_ids: list[str] = []
    selected_alternative: Alternative | None = None


class ProposalDiff(CamelModel):
    removed_place_ids: list[str]
    added_place_ids: list[str]
    description: str


class ItineraryProposal(CamelModel):
    base_version: int
    reason: str
    proposed: Course
    diff: ProposalDiff
    applied_at: datetime | None
    can_undo: bool


class ItineraryProposer:
    def __init__(self, *, routing: KakaoRoutingClient):
        self._routing = routing

    async def propose(self, request: ItineraryProposalRequest) -> ItineraryProposal:
        build = {
            "INITIAL": self._initial,
            "PLACE_REMOVED": self._place_removed,
            "WEATHER": self._weather,
        }[request.reason]
        proposed, description = await build(request)
        return ItineraryProposal(
            base_version=request.expected_version,
            reason=request.reason,
            proposed=proposed,
            diff=_diff(request.current.items, proposed.items, description),
            applied_at=None,
            can_undo=False,
        )

    async def _initial(self, request: ItineraryProposalRequest) -> tuple[Course, str]:
        places = _requested_places(request)
        trip = request.trip
        _require_initial_input(trip, places)
        day_count = (trip.end_date - trip.start_date).days + 1
        groups, not_placed = _allocate(places, day_count, trip.destination_region_ids)
        ordered = [_visit_order(group) for group in groups]
        routes = await asyncio.gather(
            *(self._routes(day, request.default_transport_mode) for day in ordered)
        )
        known_ids = _first_item_id_by_place(request.current.items)

        items: list[ItineraryItem] = []
        legs: list[ProposedLeg] = []
        counts: list[int] = []
        for day, (group, day_routes) in enumerate(zip(ordered, routes, strict=True), start=1):
            day_items = _scheduled(group, day_routes, day, known_ids)
            not_placed += len(group) - len(day_items)
            items.extend(day_items)
            legs.extend(_legs(day_items, day_routes))
            counts.append(len(day_items))
        return Course(items=items, legs=legs), _initial_text(counts, not_placed)

    async def _place_removed(self, request: ItineraryProposalRequest) -> tuple[Course, str]:
        _require_removal_input(request)
        excluded = set(request.excluded_place_ids)
        current = request.current.items
        removed = [item for item in current if item.place.id in excluded]
        changed: dict[int, list[ItineraryItem]] = {}
        routes: dict[int, list[RouteLeg]] = {}
        for day in {item.day for item in removed}:
            remaining = _renumbered(
                item for item in _items_of_day(current, day) if item.place.id not in excluded
            )
            routes[day] = await self._item_routes(remaining, request.default_transport_mode)
            changed[day] = _rescheduled(remaining, routes[day])
        text = (
            f"{len(removed)}곳을 빼고 시간을 다시 계산했어요"
            if removed
            else "뺄 장소가 코스에 없어요"
        )
        return _with_changed_days(request.current, changed, routes), text

    async def _weather(self, request: ItineraryProposalRequest) -> tuple[Course, str]:
        selected = _require_weather_input(request)
        target = _selected_item(request, selected)
        day = _items_of_day(request.current.items, target.day)
        mode = request.default_transport_mode
        if selected.type == "TIME_SHIFT":
            items, routes, text = await self._shifted(day, target, selected, mode)
        else:
            items, routes, text = await self._swapped(day, target, selected, mode)
        return _with_changed_days(request.current, {target.day: items}, {target.day: routes}), text

    async def _shifted(
        self,
        day: list[ItineraryItem],
        target: ItineraryItem,
        selected: Alternative,
        mode: TransportMode,
    ) -> tuple[list[ItineraryItem], list[RouteLeg], str]:
        clock = selected.target_start_time
        if clock is None or not re.fullmatch(TIME_PATTERN, clock):
            raise _insufficient([("selectedAlternative.targetStartTime", "옮길 시각이 없습니다.")])
        moved = [
            item.model_copy(update={"start_time": clock}) if item is target else item
            for item in day
        ]
        items = _renumbered(sorted(moved, key=_time_key))
        routes = await self._item_routes(items, mode)
        return items, routes, f"{target.place.name} 일정을 {clock}에 시작하도록 옮겼어요"

    async def _swapped(
        self,
        day: list[ItineraryItem],
        target: ItineraryItem,
        selected: Alternative,
        mode: TransportMode,
    ) -> tuple[list[ItineraryItem], list[RouteLeg], str]:
        if selected.place is None:
            raise _insufficient([("selectedAlternative.place", "바꿀 장소가 없습니다.")])
        replacement = target.model_copy(
            update={
                "id": None,
                "place": selected.place,
                "stay_minutes": _default_stay(selected.place),
            }
        )
        items = [replacement if item is target else item for item in day]
        routes = await self._item_routes(items, mode)
        text = f"{target.place.name} 대신 {selected.place.name}에 가도록 바꿨어요"
        return _pushed_later(items, routes, items.index(replacement)), routes, text

    async def _item_routes(self, items: list[ItineraryItem], mode: TransportMode) -> list[RouteLeg]:
        return await self._routes([item.place for item in items], mode)

    async def _routes(self, places: list[Place], mode: TransportMode) -> list[RouteLeg]:
        return list(
            await asyncio.gather(
                *(
                    self._routing.leg(_coordinate(a), _coordinate(b), mode)
                    for a, b in itertools.pairwise(places)
                )
            )
        )


def _requested_places(request: ItineraryProposalRequest) -> list[Place]:
    """같은 장소는 한 번만, 제외한 장소는 빼고 받은 순서대로."""
    excluded = set(request.excluded_place_ids)
    unique = {place.id: place for place in reversed(request.places)}
    return [place for place in reversed(unique.values()) if place.id not in excluded]


def _insufficient(fields: list[tuple[str, str]]) -> ApiError:
    return ApiError(
        422,
        "INSUFFICIENT_DATA",
        "코스를 만들 자료가 부족합니다.",
        [ErrorField(field=field, message=message) for field, message in fields],
    )


def _require_initial_input(trip: Trip, places: list[Place]) -> None:
    missing = []
    if trip.start_date is None:
        missing.append(("trip.startDate", "여행 시작일이 없습니다."))
    if trip.end_date is None:
        missing.append(("trip.endDate", "여행 종료일이 없습니다."))
    if not places:
        missing.append(("places", "모은 장소가 없습니다."))
    if missing:
        raise _insufficient(missing)


def _require_removal_input(request: ItineraryProposalRequest) -> None:
    missing = []
    if not request.current.items:
        missing.append(("current", "현재 코스가 없습니다."))
    if not request.excluded_place_ids:
        missing.append(("excludedPlaceIds", "제외할 장소가 없습니다."))
    if missing:
        raise _insufficient(missing)


def _require_weather_input(request: ItineraryProposalRequest) -> Alternative:
    selected = request.selected_alternative
    if selected is None:
        raise _insufficient([("selectedAlternative", "고른 날씨 대안이 없습니다.")])
    if selected.type == "INFO":
        raise ApiError(422, "UNSCHEDULABLE_ALTERNATIVE", "코스를 바꿀 수 없는 대안입니다.")
    if not request.current.items:
        raise _insufficient([("current", "현재 코스가 없습니다.")])
    return selected


def _selected_item(request: ItineraryProposalRequest, selected: Alternative) -> ItineraryItem:
    for item in request.current.items:
        if selected.item_id is not None and item.id == selected.item_id:
            return item
    raise _insufficient([("selectedAlternative.itemId", "코스에 없는 일정입니다.")])


def _items_of_day(items: list[ItineraryItem], day: int) -> list[ItineraryItem]:
    return sorted((item for item in items if item.day == day), key=lambda item: item.order)


def _renumbered(items) -> list[ItineraryItem]:
    return [item.model_copy(update={"order": order}) for order, item in enumerate(items, start=1)]


def _time_key(item: ItineraryItem) -> tuple[bool, int, int]:
    """시각을 모르는 일정은 뒤로 보낸다."""
    return item.start_time is None, _minutes(item.start_time or "00:00"), item.order


def _with_changed_days(
    current: Course,
    changed: dict[int, list[ItineraryItem]],
    routes: dict[int, list[RouteLeg]],
) -> Course:
    """바뀐 날만 새 일정·구간으로 바꾸고, 다른 날의 구간은 그대로 둔다."""
    kept = [item for item in current.items if item.day not in changed]
    items = kept + list(itertools.chain(*changed.values()))
    items.sort(key=lambda item: (item.day, item.order))
    legs = _kept_legs(current.legs, kept)
    for day, day_items in changed.items():
        legs.extend(_legs(day_items, routes[day]))
    legs.sort(key=lambda leg: (leg.day, leg.from_order))
    return Course(items=items, legs=legs)


def _kept_legs(legs: list[ProposedLeg], kept: list[ItineraryItem]) -> list[ProposedLeg]:
    by_id = {item.id: item for item in kept if item.id is not None}
    result = []
    for leg in legs:
        start, end = by_id.get(leg.from_item_id), by_id.get(leg.to_item_id)
        if start is not None and end is not None:
            position = {"day": start.day, "from_order": start.order, "to_order": end.order}
            result.append(leg.model_copy(update=position))
    return result


def _rescheduled(items: list[ItineraryItem], routes: list[RouteLeg]) -> list[ItineraryItem]:
    """첫 일정 시각에서 다시 잇는다. 식당은 원래 시각에 가까운 끼니를 지킨다."""
    if not items:
        return []
    first = items[0].start_time
    start = _minutes(first) if first else DAY_START_MINUTES
    stays = [_stay_of(item) for item in items]
    gaps = [_gap_minutes(route) for route in routes]
    walked = _walk(stays, gaps, _kept_meal_targets(items), start)
    return [
        item.model_copy(update={"start_time": _clock_in_day(begin), "stay_minutes": stay})
        for item, stay, (_, begin) in zip(items, stays, walked, strict=True)
    ]


def _kept_meal_targets(items: list[ItineraryItem]) -> list[int | None]:
    by_order = _meal_targets(item.place for item in items)
    targets: list[int | None] = []
    for item, default in zip(items, by_order, strict=True):
        if default is None or item.start_time is None:
            targets.append(default)
        else:
            current = _minutes(item.start_time)
            targets.append(min(MEAL_MINUTES, key=lambda meal: abs(meal - current)))
    return targets


def _pushed_later(
    items: list[ItineraryItem], routes: list[RouteLeg], changed_index: int
) -> list[ItineraryItem]:
    """바꾼 일정 뒤로, 겹치는 일정만 늦춘다. 비어 있는 시간을 앞당기지는 않는다."""
    result = list(items)
    for index in range(changed_index + 1, len(result)):
        before, item = result[index - 1], result[index]
        if before.start_time is None or item.start_time is None:
            continue
        arrival = _minutes(before.start_time) + _stay_of(before) + _gap_minutes(routes[index - 1])
        if arrival > _minutes(item.start_time):
            result[index] = item.model_copy(update={"start_time": _clock_in_day(arrival)})
    return result


def _stay_of(item: ItineraryItem) -> int:
    return _default_stay(item.place) if item.stay_minutes is None else item.stay_minutes


def _clock_in_day(minutes: int) -> str | None:
    """구간이 길어 자정을 넘기면 시각을 정하지 못한 일정으로 둔다."""
    return _clock(minutes) if minutes < MINUTES_IN_DAY else None


def _allocate(
    places: list[Place], day_count: int, region_ids: list[str]
) -> tuple[list[list[Place]], int]:
    """날짜별 장소 묶음과 하루 최대 개수 때문에 빠진 장소 수."""
    groups = _by_region(places, region_ids, day_count)
    days: list[list[Place]] = []
    not_placed = 0
    for group, share in zip(groups, _day_shares(groups, day_count), strict=True):
        kept = group[: share * MAX_PLACES_PER_DAY]
        not_placed += len(group) - len(kept)
        days.extend(day for day in _split_nearby(kept, share) if day)
    return days, not_placed


def _by_region(places: list[Place], region_ids: list[str], day_count: int) -> list[list[Place]]:
    """여행지가 여럿이면 지역별로 나눈다. 지역을 모르는 장소는 가장 가까운 묶음으로 간다."""
    groups: dict[str, list[Place]] = {region_id: [] for region_id in region_ids}
    unknown = []
    for place in places:
        if len(groups) > 1 and place.region_id in groups:
            groups[place.region_id].append(place)
        else:
            unknown.append(place)
    found = [group for group in groups.values() if group]
    if not found:
        return [places]
    for place in unknown:
        nearest = min(found, key=lambda group: min(_meters(place, other) for other in group))
        nearest.append(place)
    if len(found) > day_count:
        found[day_count - 1 :] = [list(itertools.chain(*found[day_count - 1 :]))]
    return found


def _day_shares(groups: list[list[Place]], day_count: int) -> list[int]:
    """묶음마다 하루씩 주고, 남은 날은 하루 장소 수가 가장 많은 묶음에 준다."""
    shares = [1] * len(groups)
    for _ in range(day_count - len(groups)):
        busiest = max(range(len(groups)), key=lambda i: len(groups[i]) / shares[i])
        shares[busiest] += 1
    return shares


def _split_nearby(places: list[Place], days: int) -> list[list[Place]]:
    """더 넓게 퍼진 축으로 정렬해 반씩 나눈다. 날짜별 개수 차이는 많아야 1이다."""
    if days == 1 or not places:
        return [places]
    latitudes = [place.latitude for place in places]
    longitude_scale = math.cos(math.radians(sum(latitudes) / len(latitudes)))
    longitudes = [place.longitude * longitude_scale for place in places]
    if max(latitudes) - min(latitudes) >= max(longitudes) - min(longitudes):
        ordered = sorted(places, key=lambda place: place.latitude)
    else:
        ordered = sorted(places, key=lambda place: place.longitude)
    left_days = days // 2
    count = len(places) * left_days // days
    return _split_nearby(ordered[:count], left_days) + _split_nearby(
        ordered[count:], days - left_days
    )


def _visit_order(places: list[Place]) -> list[Place]:
    """식사 시각에 가장 가깝고, 그다음 이동이 가장 짧은 순서. 하루 5곳이라 전부 따져 본다."""
    return list(min(itertools.permutations(places), key=_order_cost))


def _order_cost(order: tuple[Place, ...]) -> tuple[int, float]:
    gaps = [ESTIMATED_LEG_MINUTES] * (len(order) - 1)
    stays = [_default_stay(place) for place in order]
    targets = _meal_targets(order)
    walked = _walk(stays, gaps, targets, DAY_START_MINUTES)
    meal_error = sum(
        abs(arrival - target)
        for (arrival, _), target in zip(walked, targets, strict=True)
        if target is not None
    )
    return meal_error, sum(_meters(a, b) for a, b in itertools.pairwise(order))


def _meal_targets(places) -> list[int | None]:
    """앞선 식당부터 점심, 저녁. 그 뒤 식당은 일반 장소처럼 잇는다."""
    meals = iter(MEAL_MINUTES)
    return [next(meals, None) if _is_restaurant(place) else None for place in places]


def _walk(
    stays: list[int], gaps: list[int], targets: list[int | None], first_start: int
) -> list[tuple[int, int]]:
    """(도착, 시작) 시각. 식사는 정한 시각 전이면 기다렸다 시작한다."""
    walked = []
    clock = first_start
    for index, stay in enumerate(stays):
        if index:
            clock += gaps[index - 1]
        arrival = clock
        target = targets[index]
        if target is not None:
            clock = max(clock, target)
        walked.append((arrival, clock))
        clock += stay
    return walked


def _gap_minutes(route: RouteLeg) -> int:
    if route.duration_seconds is None:
        return UNAVAILABLE_LEG_MINUTES
    return math.ceil(route.duration_seconds / HOUR)


def _scheduled(
    places: list[Place], routes: list[RouteLeg], day: int, known_ids: dict[str, str | None]
) -> list[ItineraryItem]:
    """하루 끝(21:00) 안에 끝나는 앞쪽 일정만 남긴다."""
    stays = [_default_stay(place) for place in places]
    walked = _walk(
        stays, [_gap_minutes(route) for route in routes], _meal_targets(places), DAY_START_MINUTES
    )
    items = []
    for order, (place, stay, (_, start)) in enumerate(zip(places, stays, walked, strict=True), 1):
        if start + stay > DAY_END_MINUTES:
            break
        items.append(
            ItineraryItem(
                id=known_ids.get(place.id),
                place=place,
                day=day,
                order=order,
                start_time=_clock(start),
                stay_minutes=stay,
            )
        )
    return items


def _legs(items: list[ItineraryItem], routes: list[RouteLeg]) -> list[ProposedLeg]:
    queried_at = datetime.now(UTC)
    return [
        ProposedLeg(
            from_item_id=a.id,
            to_item_id=b.id,
            day=a.day,
            from_order=a.order,
            to_order=b.order,
            transport_mode=route.transport_mode.value,
            duration_seconds=route.duration_seconds,
            status=route.status,
            queried_at=queried_at,
        )
        for (a, b), route in zip(itertools.pairwise(items), routes, strict=False)
    ]


def _first_item_id_by_place(items: list[ItineraryItem]) -> dict[str, str | None]:
    return {item.place.id: item.id for item in reversed(items)}


def _diff(
    before: list[ItineraryItem], after: list[ItineraryItem], description: str
) -> ProposalDiff:
    old = list(dict.fromkeys(item.place.id for item in before))
    new = list(dict.fromkeys(item.place.id for item in after))
    return ProposalDiff(
        removed_place_ids=[place_id for place_id in old if place_id not in new],
        added_place_ids=[place_id for place_id in new if place_id not in old],
        description=description,
    )


def _initial_text(counts: list[int], not_placed: int) -> str:
    days = ", ".join(f"{day}일차 {count}곳" for day, count in enumerate(counts, start=1))
    text = f"{days}으로 짰어요"
    return f"{text}. {not_placed}곳은 넣지 못했어요" if not_placed else text


def _words(category: str) -> list[list[str]]:
    return [[word.strip() for word in part.split(",")] for part in category.split(">")]


def _is_cafe(place: Place) -> bool:
    return bool(place.category) and "카페" in itertools.chain(*_words(place.category))


def _is_restaurant(place: Place) -> bool:
    if not place.category or _is_cafe(place):
        return False
    return bool(FOOD_TOP_WORDS.intersection(_words(place.category)[0]))


def _default_stay(place: Place) -> int:
    if _is_cafe(place):
        return CAFE_STAY_MINUTES
    if _is_restaurant(place):
        return RESTAURANT_STAY_MINUTES
    category = place.category or ""
    if is_outdoor(category) is True or any(word in category for word in INDOOR_SIGHT_WORDS):
        return SIGHT_STAY_MINUTES
    return OTHER_STAY_MINUTES


def _coordinate(place: Place) -> Coordinate:
    return Coordinate(latitude=place.latitude, longitude=place.longitude)


def _meters(a: Place, b: Place) -> float:
    return straight_line_meters(_coordinate(a), _coordinate(b))
