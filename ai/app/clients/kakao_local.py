"""카카오 로컬 키워드 검색. 좌표·주소는 AI가 만들지 않고 여기서만 가져온다."""

import logging

import httpx

from app.clients.errors import ProviderUnavailable
from app.core.schemas import CamelModel

log = logging.getLogger("ai")

KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"


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


class KakaoLocalClient:
    def __init__(self, http: httpx.AsyncClient, *, api_key: str, timeout_seconds: float):
        self._http = http
        self._key = api_key
        self._timeout = timeout_seconds

    async def search(self, query: str, size: int = 3) -> list[ProviderPlace]:
        """결과 없음은 빈 목록, 장애는 PlaceSearchUnavailable로 구분한다."""
        if not self._key:
            raise PlaceSearchUnavailable("카카오 키가 설정되지 않았습니다.")
        try:
            response = await self._http.get(
                KEYWORD_URL,
                params={"query": query, "size": size},
                headers={"Authorization": f"KakaoAK {self._key}"},
                timeout=self._timeout,
            )
            response.raise_for_status()
            return [_to_place(document) for document in response.json()["documents"]]
        except (httpx.HTTPError, KeyError, TypeError, ValueError, AttributeError) as e:
            log.warning("place_search_failed error=%s", type(e).__name__)
            raise PlaceSearchUnavailable("장소 검색에 실패했습니다.") from e


def _to_place(document: dict) -> ProviderPlace:
    return ProviderPlace(
        name=document["place_name"],
        address=document.get("road_address_name") or document.get("address_name") or None,
        latitude=float(document["y"]),
        longitude=float(document["x"]),
        provider="KAKAO",
        provider_place_id=str(document["id"]),
        category=document.get("category_name") or None,
    )
