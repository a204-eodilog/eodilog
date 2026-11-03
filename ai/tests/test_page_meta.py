"""링크 메타데이터와 SSRF 방지 (spec §2, T-01-4 ~ T-01-6)."""

import asyncio
import socket

import httpx
import pytest
import respx

from app.clients.page_meta import LinkFetchError, PageMetaFetcher, UnsupportedLink

PUBLIC_IP = "93.184.216.34"
PUBLIC_URL = f"https://{PUBLIC_IP}/post"

PAGE = """
<html><head>
<title>기본 제목</title>
<meta property="og:title" content="부산 카페 추천">
<meta property="og:description" content="흰여울문화마을 근처 신기산업">
<meta property="og:site_name" content="블로그">
<script type="application/ld+json">
{"@type": "Place", "name": "신기산업", "address": {"@type": "Address", "street": "영도구"}}
</script>
<script type="application/ld+json">not json</script>
</head></html>
"""


def html(body: str = PAGE, status: int = 200, **headers) -> httpx.Response:
    return httpx.Response(
        status, text=body, headers={"Content-Type": "text/html; charset=utf-8", **headers}
    )


def fake_resolver(hosts: dict[str, list[str]]):
    async def resolve(host: str) -> list[str]:
        if host not in hosts:
            raise socket.gaierror("not found")
        return hosts[host]

    return resolve


@pytest.fixture
async def http():
    async with httpx.AsyncClient() as client:
        yield client


@pytest.fixture
def fetcher(http):
    return PageMetaFetcher(
        http,
        timeout_seconds=1,
        resolver=fake_resolver({"example.com": [PUBLIC_IP], "other.com": [PUBLIC_IP]}),
    )


@respx.mock
async def test_reads_public_metadata(fetcher):
    respx.get(PUBLIC_URL).mock(return_value=html())

    meta = await fetcher.fetch("https://example.com/post")

    assert meta.final_url == "https://example.com/post"
    assert meta.title == "부산 카페 추천"
    assert meta.description == "흰여울문화마을 근처 신기산업"
    assert meta.site_name == "블로그"
    assert meta.structured == ["신기산업 / 영도구"]
    assert not meta.is_empty


@respx.mock
async def test_falls_back_to_title_tag(fetcher):
    respx.get(PUBLIC_URL).mock(return_value=html("<title> 제목만 </title>"))

    meta = await fetcher.fetch("https://example.com/post")

    assert meta.title == "제목만"


@respx.mock
async def test_page_without_metadata_is_empty_not_failure(fetcher):
    respx.get(PUBLIC_URL).mock(return_value=html("<p>본문</p>"))

    assert (await fetcher.fetch("https://example.com/post")).is_empty


@respx.mock
async def test_long_text_is_clipped(fetcher):
    respx.get(PUBLIC_URL).mock(
        return_value=html(f'<meta property="og:description" content="{"가" * 5000}">')
    )

    meta = await fetcher.fetch("https://example.com/post")

    assert len(meta.description) == 500


@respx.mock
async def test_deeply_nested_json_ld_does_not_fail(fetcher):
    body = f'<script type="application/ld+json">{"[" * 200000}</script><title>제목</title>'
    respx.get(PUBLIC_URL).mock(return_value=html(body))

    meta = await fetcher.fetch("https://example.com/post")

    assert meta.title == "제목"
    assert meta.structured == []


@respx.mock
async def test_connects_to_checked_ip_so_dns_cannot_change_after_check(fetcher):
    # 검사한 뒤 다시 이름을 풀면 그사이 내부 주소로 바뀔 수 있다(DNS 재바인딩)
    route = respx.get(PUBLIC_URL).mock(return_value=html())

    await fetcher.fetch("https://example.com/post")

    request = route.calls.last.request
    assert request.url.host == PUBLIC_IP
    assert request.headers["Host"] == "example.com"
    assert request.extensions["sni_hostname"] == "example.com"
    # 같은 IP의 다른 사이트가 TLS 연결을 재사용하지 않게 한다
    assert request.headers["Connection"] == "close"


@respx.mock
async def test_prefers_ipv4_and_connects_to_ipv6_with_brackets(http):
    both = PageMetaFetcher(
        http, timeout_seconds=1, resolver=fake_resolver({"a.com": ["2606:4700::1", PUBLIC_IP]})
    )
    v6_only = PageMetaFetcher(
        http, timeout_seconds=1, resolver=fake_resolver({"b.com": ["2606:4700::1"]})
    )
    v4_route = respx.get(PUBLIC_URL).mock(return_value=html())
    v6_route = respx.get("https://[2606:4700::1]/post").mock(return_value=html())

    await both.fetch("https://a.com/post")
    await v6_only.fetch("https://b.com/post")

    assert v4_route.called
    assert v6_route.called


@pytest.mark.parametrize(
    "ip",
    [
        "127.0.0.1",
        "10.0.0.5",
        "172.16.0.1",
        "192.168.0.1",
        "169.254.169.254",
        "100.64.0.1",
        "0.0.0.0",
        "224.0.0.1",
        "::1",
        "::ffff:127.0.0.1",
        "fe80::1",
        "fc00::1",
        "ff02::1",
        "64:ff9b::7f00:1",
        "2002:7f00:1::",
    ],
)
@respx.mock(assert_all_called=False)
async def test_blocks_non_public_addresses_without_connecting(http, respx_mock, ip):
    catch_all = respx_mock.route().mock(return_value=html())
    fetcher = PageMetaFetcher(http, timeout_seconds=1, resolver=fake_resolver({"evil.com": [ip]}))

    with pytest.raises(LinkFetchError) as raised:
        await fetcher.fetch("https://evil.com/")

    assert not isinstance(raised.value, UnsupportedLink)
    assert not catch_all.called


@respx.mock(assert_all_called=False)
async def test_blocks_host_when_any_address_is_private(http, respx_mock):
    catch_all = respx_mock.route().mock(return_value=html())
    fetcher = PageMetaFetcher(
        http, timeout_seconds=1, resolver=fake_resolver({"evil.com": [PUBLIC_IP, "10.0.0.5"]})
    )

    with pytest.raises(LinkFetchError):
        await fetcher.fetch("https://evil.com/")

    assert not catch_all.called


@pytest.mark.parametrize(
    "url",
    [
        "ftp://example.com/a",
        "file:///etc/passwd",
        "https://user:pw@example.com/",
        "https://example.com:8080/",
        "https://",
        "no scheme",
    ],
)
async def test_unsupported_urls_are_distinguished_for_422(fetcher, url):
    with pytest.raises(UnsupportedLink):
        await fetcher.fetch(url)


@respx.mock
async def test_follows_relative_redirect_and_checks_each_hop(http):
    resolved: list[str] = []

    async def resolve(host: str) -> list[str]:
        resolved.append(host)
        return [PUBLIC_IP]

    fetcher = PageMetaFetcher(http, timeout_seconds=1, resolver=resolve)
    respx.get(f"https://{PUBLIC_IP}/a").mock(
        return_value=httpx.Response(302, headers={"Location": "/b"})
    )
    respx.get(f"https://{PUBLIC_IP}/b").mock(
        return_value=httpx.Response(301, headers={"Location": "https://other.com/c"})
    )
    respx.get(f"https://{PUBLIC_IP}/c").mock(return_value=html())

    meta = await fetcher.fetch("https://example.com/a")

    assert meta.final_url == "https://other.com/c"
    assert resolved == ["example.com", "example.com", "other.com"]


@respx.mock
async def test_redirect_to_private_address_is_blocked(http):
    fetcher = PageMetaFetcher(
        http,
        timeout_seconds=1,
        resolver=fake_resolver({"example.com": [PUBLIC_IP], "internal": ["10.0.0.5"]}),
    )
    respx.get(PUBLIC_URL).mock(
        return_value=httpx.Response(302, headers={"Location": "http://internal/admin"})
    )
    internal = respx.get("http://10.0.0.5/admin").mock(return_value=html())

    with pytest.raises(LinkFetchError):
        await fetcher.fetch("https://example.com/post")

    assert not internal.called


@respx.mock
async def test_redirect_to_unsupported_scheme_is_read_failure_not_422(fetcher):
    # 사용자가 준 주소는 정상이므로 입력 오류로 돌려보내지 않는다
    respx.get(PUBLIC_URL).mock(
        return_value=httpx.Response(302, headers={"Location": "ftp://example.com/a"})
    )

    with pytest.raises(LinkFetchError) as raised:
        await fetcher.fetch("https://example.com/post")

    assert not isinstance(raised.value, UnsupportedLink)


@respx.mock
async def test_too_many_redirects_fail(fetcher):
    route = respx.get(PUBLIC_URL).mock(
        return_value=httpx.Response(302, headers={"Location": "/post"})
    )

    with pytest.raises(LinkFetchError):
        await fetcher.fetch("https://example.com/post")

    assert route.call_count == 6


@pytest.mark.parametrize(
    "mock",
    [
        {"return_value": httpx.Response(403)},
        {"return_value": httpx.Response(404)},
        {"return_value": httpx.Response(500)},
        {"return_value": httpx.Response(304)},
        {
            "return_value": httpx.Response(
                200, content=b"\x89PNG", headers={"Content-Type": "image/png"}
            )
        },
        {"side_effect": httpx.ConnectError("refused")},
    ],
    ids=["403", "404", "500", "redirect-without-location", "not-html", "connect-error"],
)
@respx.mock
async def test_unreadable_pages_fail(fetcher, mock):
    respx.get(PUBLIC_URL).mock(**mock)

    with pytest.raises(LinkFetchError):
        await fetcher.fetch("https://example.com/post")


async def test_unknown_host_fails(fetcher):
    with pytest.raises(LinkFetchError):
        await fetcher.fetch("https://unknown.example/")


@respx.mock
async def test_slow_page_fails_within_total_timeout(http):
    async def slow(request):
        await asyncio.sleep(5)
        return html()

    fetcher = PageMetaFetcher(
        http, timeout_seconds=0.05, resolver=fake_resolver({"example.com": [PUBLIC_IP]})
    )
    respx.get(PUBLIC_URL).mock(side_effect=slow)

    with pytest.raises(LinkFetchError):
        await asyncio.wait_for(fetcher.fetch("https://example.com/post"), timeout=1)


@respx.mock
async def test_large_page_is_read_only_up_to_limit(http):
    fetcher = PageMetaFetcher(
        http,
        timeout_seconds=1,
        max_bytes=100,
        resolver=fake_resolver({"example.com": [PUBLIC_IP]}),
    )
    body = "<title>앞부분</title>" + " " * 200 + "<meta name='description' content='뒷부분'>"
    respx.get(PUBLIC_URL).mock(return_value=html(body))

    meta = await fetcher.fetch("https://example.com/post")

    assert meta.title == "앞부분"
    assert meta.description is None


@respx.mock
async def test_failure_log_does_not_contain_url(fetcher, caplog):
    respx.get(f"https://{PUBLIC_IP}/secret-token").mock(return_value=httpx.Response(403))

    with pytest.raises(LinkFetchError) as raised:
        await fetcher.fetch("https://example.com/secret-token")

    assert "secret-token" not in caplog.text
    assert "secret-token" not in str(raised.value)
