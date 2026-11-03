"""링크의 공개 메타데이터 수집 (spec §2).

사용자가 준 URL을 서버가 대신 요청하므로 내부망 요청(SSRF)을 막는다. 리다이렉트도 단계마다 검사하고,
검사한 뒤 이름이 내부 주소로 바뀌는 DNS 재바인딩을 막으려고 검사한 IP로 직접 연결한다.
읽어 온 내용은 신뢰할 수 없는 입력이다. LLM에 보낼 때 지시문이 아닌 자료로 다룬다.
"""

import asyncio
import ipaddress
import json
import logging
import socket
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

log = logging.getLogger("ai")

MAX_REDIRECTS = 5
MAX_BYTES = 2_000_000
MAX_TEXT_CHARS = 500
MAX_STRUCTURED_ITEMS = 5
USER_AGENT = "Mozilla/5.0 (compatible; EodilogBot/0.1)"
_ALLOWED_PORTS = (None, 80, 443)
_NAT64 = ipaddress.ip_network("64:ff9b::/96")

Resolver = Callable[[str], Awaitable[list[str]]]


class LinkFetchError(Exception):
    """링크를 읽지 못함. 메시지는 사유 코드이며 URL을 담지 않는다."""


class UnsupportedLink(LinkFetchError):
    """처음부터 받을 수 없는 주소. 422 UNSUPPORTED_INPUT으로 돌려준다."""


@dataclass
class PageMeta:
    final_url: str
    title: str | None = None
    description: str | None = None
    site_name: str | None = None
    # JSON-LD에서 얻은 장소 이름·주소
    structured: list[str] = field(default_factory=list)

    @property
    def is_empty(self) -> bool:
        return not (self.title or self.description or self.structured)


async def system_resolver(host: str) -> list[str]:
    infos = await asyncio.to_thread(socket.getaddrinfo, host, None)
    return [str(info[4][0]) for info in infos]


class PageMetaFetcher:
    def __init__(
        self,
        http: httpx.AsyncClient,
        *,
        timeout_seconds: float,
        max_bytes: int = MAX_BYTES,
        resolver: Resolver = system_resolver,
    ):
        self._http = http
        self._timeout = timeout_seconds
        self._max_bytes = max_bytes
        self._resolve = resolver

    async def fetch(self, url: str) -> PageMeta:
        try:
            # httpx 타임아웃은 읽기 한 번마다 적용되므로 조금씩 보내는 서버는 전체 시간으로 끊는다
            async with asyncio.timeout(self._timeout):
                return await self._follow(url)
        except TimeoutError:
            log.warning("link_fetch_failed reason=timeout")
            raise LinkFetchError("timeout") from None
        except (httpx.HTTPError, httpx.InvalidURL) as e:
            log.warning("link_fetch_failed reason=%s", type(e).__name__)
            raise LinkFetchError("connection") from None
        except LinkFetchError as e:
            log.warning("link_fetch_failed reason=%s", e)
            raise

    async def _follow(self, url: str) -> PageMeta:
        current = url
        for hop in range(MAX_REDIRECTS + 1):
            try:
                target = _parse_target(current)
            except UnsupportedLink:
                if hop == 0:
                    raise
                # 사용자가 준 주소는 정상이므로 입력 오류로 돌려보내지 않는다
                raise LinkFetchError("redirect_unsupported") from None
            host = target.raw_host.decode()
            ip = await self._public_ip(host)
            async with self._http.stream(
                "GET",
                target.copy_with(host=f"[{ip}]" if ":" in ip else ip),
                headers={"Host": host, "User-Agent": USER_AGENT, "Connection": "close"},
                extensions={"sni_hostname": host},
                timeout=self._timeout,
                follow_redirects=False,
            ) as response:
                if response.has_redirect_location:
                    current = urljoin(current, response.headers["Location"])
                    continue
                if not response.is_success:
                    raise LinkFetchError(f"status_{response.status_code}")
                content_type = response.headers.get("Content-Type", "text/html").lower()
                if "html" not in content_type:
                    raise LinkFetchError("not_html")
                return _parse_meta(current, await self._read_limited(response))
        raise LinkFetchError("too_many_redirects")

    async def _public_ip(self, host: str) -> str:
        try:
            ips = await self._resolve(host)
        except (OSError, UnicodeError):
            raise LinkFetchError("host_not_found") from None
        if not ips:
            raise LinkFetchError("host_not_found")
        if not all(_is_public(ip) for ip in ips):
            raise LinkFetchError("blocked_address")
        return min(ips, key=lambda ip: ":" in ip)  # IPv4를 먼저 쓴다

    async def _read_limited(self, response: httpx.Response) -> bytes:
        body = bytearray()
        async for chunk in response.aiter_bytes():
            body.extend(chunk)
            if len(body) >= self._max_bytes:
                break
        return bytes(body[: self._max_bytes])


def _parse_target(url: str) -> httpx.URL:
    try:
        target = httpx.URL(url)
    except (httpx.InvalidURL, TypeError):
        raise UnsupportedLink("invalid_url") from None
    if (
        target.scheme not in ("http", "https")
        or not target.host
        or target.userinfo
        or target.port not in _ALLOWED_PORTS
    ):
        raise UnsupportedLink("unsupported_url")
    return target


def _is_public(text: str) -> bool:
    try:
        ip = ipaddress.ip_address(text)
    except ValueError:
        return False
    # is_global은 멀티캐스트와 IPv4를 품은 IPv6 주소를 공개 주소로 판단할 수 있다
    if not ip.is_global or ip.is_multicast:
        return False
    if isinstance(ip, ipaddress.IPv6Address):
        return not (ip.ipv4_mapped or ip.sixtofour or ip.teredo or ip in _NAT64)
    return True


def _parse_meta(final_url: str, html: bytes) -> PageMeta:
    soup = BeautifulSoup(html, "html.parser")

    def meta(*keys: str) -> str | None:
        for key in keys:
            tag = soup.find("meta", attrs={"property": key}) or soup.find(
                "meta", attrs={"name": key}
            )
            if tag and tag.get("content"):
                return _clip(tag["content"])
        return None

    title = meta("og:title", "twitter:title")
    if not title and soup.title and soup.title.string:
        title = _clip(soup.title.string)
    return PageMeta(
        final_url=final_url,
        title=title,
        description=meta("og:description", "description", "twitter:description"),
        site_name=meta("og:site_name"),
        structured=_structured_places(soup),
    )


def _structured_places(soup: BeautifulSoup) -> list[str]:
    places: list[str] = []
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except (ValueError, RecursionError):
            continue
        for item in data if isinstance(data, list) else [data]:
            if not isinstance(item, dict) or not item.get("name"):
                continue
            address = item.get("address")
            if isinstance(address, dict):
                address = " ".join(str(v) for k, v in address.items() if not k.startswith("@"))
            places.append(_clip(f"{item['name']} / {address}" if address else item["name"]))
    return places[:MAX_STRUCTURED_ITEMS]


def _clip(value: object) -> str:
    return str(value).strip()[:MAX_TEXT_CHARS]
