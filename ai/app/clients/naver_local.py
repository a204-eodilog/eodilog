"""네이버 지역 검색. 좌표·주소는 AI가 만들지 않고 여기서만 가져온다."""

import hashlib
import html
import logging
import re

import httpx

from app.clients.errors import ProviderUnavailable
from app.core.metrics import record_provider_failure
from app.core.schemas import CamelModel
from app.core.text import normalize

log = logging.getLogger("ai")

LOCAL_SEARCH_URL = "https://naverapihub.apigw.ntruss.com/search/v1/local"
MAX_DISPLAY = 5
_TAG = re.compile(r"<[^>]+>")


class PlaceSearchUnavailable(ProviderUnavailable):
    pass


class ProviderPlace(CamelModel):
    name: str
    address: str | None
    latitude: float
    longitude: float
    provider: str
    provider_place_id: str
    category: str | None


def provider_place_id(name: str, address: str) -> str:
    """네이버 응답에는 장소 ID가 없어 이름과 주소로 만든다 (AS-12).

    백엔드도 같은 장소를 같은 값으로 저장해야 하므로 -162 합의 대상이다.
    """
    source = f"{normalize(name)}\n{normalize(address)}"
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


class NaverLocalClient:
    def __init__(
        self,
        http: httpx.AsyncClient,
        *,
        client_id: str,
        client_secret: str,
        timeout_seconds: float,
    ):
        self._http = http
        self._client_id = client_id
        self._client_secret = client_secret
        self._timeout = timeout_seconds

    async def search(self, query: str, size: int = 3) -> list[ProviderPlace]:
        """결과 없음은 빈 목록, 장애는 PlaceSearchUnavailable로 구분한다."""
        if not (self._client_id and self._client_secret):
            record_provider_failure()
            raise PlaceSearchUnavailable("네이버 키가 설정되지 않았습니다.")
        try:
            response = await self._http.get(
                LOCAL_SEARCH_URL,
                params={"query": query, "display": min(size, MAX_DISPLAY)},
                headers={
                    "X-NCP-APIGW-API-KEY-ID": self._client_id,
                    "X-NCP-APIGW-API-KEY": self._client_secret,
                },
                timeout=self._timeout,
            )
            response.raise_for_status()
            places = [_to_place(item) for item in response.json()["items"]]
        except (httpx.HTTPError, KeyError, TypeError, ValueError, AttributeError) as e:
            record_provider_failure()
            log.warning("place_search_failed error=%s", type(e).__name__)
            raise PlaceSearchUnavailable("장소 검색에 실패했습니다.") from e
        found = (place for place in places if place)
        return list({place.provider_place_id: place for place in found}.values())


def _to_place(item: dict) -> ProviderPlace | None:
    """주소가 없는 결과는 안정된 ID를 만들 수 없어 None으로 건너뛴다."""
    name = html.unescape(_TAG.sub("", item["title"])).strip()
    longitude = _coordinate(item["mapx"], 180)
    latitude = _coordinate(item["mapy"], 90)
    if not name:
        raise ValueError("장소 이름이 비어 있습니다.")
    address = item.get("roadAddress") or item.get("address")
    if not address:
        return None
    return ProviderPlace(
        name=name,
        address=address,
        latitude=latitude,
        longitude=longitude,
        provider="NAVER",
        provider_place_id=provider_place_id(name, address),
        category=item.get("category") or None,
    )


def _coordinate(raw: str, limit: int) -> float:
    """문서는 WGS84라고만 밝힌다. 정수 표기(1290450000)와 소수 표기를 모두 읽는다."""
    value = float(raw)
    if abs(value) > 180:
        value /= 10_000_000
    if abs(value) > limit:
        raise ValueError("좌표 범위를 벗어났습니다.")
    return value
