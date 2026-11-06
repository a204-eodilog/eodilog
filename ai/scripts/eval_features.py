"""LLM 기능 PoC 평가. 실제 HTTP 경로를 앱 안에서 부르고 실제 GMS·네이버를 쓴다.

대상: 취향 추론(T-02), 준비물 제안(T-07), 장소 추출 링크·메모(T-01)와 캡처 5장 확인.

사용:
  uv run python -m scripts.eval_features --run 1 [--features preference_inference ...]
  uv run python -m scripts.eval_features --summary
입력: eval_data/<기능>/cases.json (캡처는 eval_data/places/images)
출력: eval_data/<기능>/results/<날짜>.jsonl (한 줄 = 사례 하나의 한 번 실행)
      같은 날짜·회차·사례가 이미 있으면 건너뛰므로 이어서 돌릴 수 있다.

링크 사례 중 *.eval-fixture.test 주소는 사례의 page로 만든 고정 HTML을 돌려준다.
고정 페이지는 SSRF 검사에서 공개 IP로 풀리게 하고, 연결만 가로챈다. 나머지 주소는 실제로 요청한다.
"""

import argparse
import asyncio
import copy
import html
import json
import logging
import math
import statistics
import subprocess
import time
from datetime import date
from pathlib import Path

import httpx

from app.clients.naver_local import NaverLocalClient
from app.clients.page_meta import LinkFetchError, PageMetaFetcher, system_resolver
from app.core.config import Settings
from app.core.text import normalize
from app.features.checklist_suggestion.service import MAX_LLM_ITEMS
from app.features.place_extraction.service import EVIDENCE_TEXT, PlaceExtractor, _page_text
from app.features.preference_inference.service import MAX_TAGS, VOCABULARY
from app.main import _build_llm, create_app
from scripts.eval_places import score_image

DATA = Path("eval_data")
FEATURES = {
    "preference_inference": "/ai/v1/preference-inferences",
    "checklist_suggestion": "/ai/v1/checklist-suggestions",
    "place_extraction": "/ai/v1/place-extractions",
}
EVAL_TOKEN = "eval-local-token"
FIXTURE_SUFFIX = ".eval-fixture.test"
FIXTURE_IP = "93.184.215.14"  # 공개 IP. 고정 페이지는 이 주소로 연결하지 않고 가로챈다
# 사양에 없는 판단 기준. 보고서에서 '제안'으로 표시한다
PROPOSED_CHECKS = {"forbidden_free"}
STATUSES = {"SUCCESS", "MULTIPLE_CANDIDATES", "NOT_FOUND", "FAILED"}
DEFAULT_MAX_CALLS = 150


# ---------- 로그에서 LLM 호출·토큰을 센다 ----------


class LogCapture(logging.Handler):
    def __init__(self):
        super().__init__(logging.INFO)
        self.reset()

    def reset(self):
        self.calls = 0
        self.failures = 0
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.events: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        message = record.getMessage()
        if message.startswith("llm_call "):
            self.calls += 1
            _, prompt, completion = record.args
            self.prompt_tokens += prompt or 0
            self.completion_tokens += completion or 0
        elif message.startswith("llm_call_failed"):
            self.calls += 1
            self.failures += 1
            self.events.append(message)
        elif not message.startswith("path="):
            self.events.append(message)


# ---------- 링크 고정 페이지 ----------


def fixture_html(page: dict) -> str:
    def meta(prop: str, value: str | None) -> str:
        return f'<meta property="{prop}" content="{html.escape(value)}">' if value else ""

    scripts = "".join(
        f'<script type="application/ld+json">{json.dumps(item, ensure_ascii=False)}</script>'
        for item in page.get("jsonld", [])
    )
    return (
        "<!doctype html><html><head><meta charset='utf-8'>"
        f"<title>{html.escape(page.get('title') or '')}</title>"
        f"{meta('og:site_name', page.get('site_name'))}{meta('og:title', page.get('title'))}"
        f"{meta('og:description', page.get('description'))}{scripts}</head><body></body></html>"
    )


class FixtureTransport(httpx.AsyncBaseTransport):
    """Host가 고정 도메인이면 사례의 HTML을, 아니면 실제 네트워크 응답을 돌려준다."""

    def __init__(self, pages: dict[str, str]):
        self._pages = pages
        self._real = httpx.AsyncHTTPTransport()

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        host = request.headers.get("host", "")
        if host.endswith(FIXTURE_SUFFIX):
            body = self._pages.get(request.url.path.strip("/"))
            if body is None:
                return httpx.Response(404, headers={"Content-Type": "text/html"})
            return httpx.Response(
                200, headers={"Content-Type": "text/html; charset=utf-8"}, content=body.encode()
            )
        return await self._real.handle_async_request(request)

    async def aclose(self) -> None:
        await self._real.aclose()


async def fixture_resolver(host: str) -> list[str]:
    return [FIXTURE_IP] if host.endswith(FIXTURE_SUFFIX) else await system_resolver(host)


# ---------- 사례 → 요청 ----------


def load_cases(feature: str) -> dict:
    return json.loads((DATA / feature / "cases.json").read_text("utf-8"))


def build_request(feature: str, case: dict, spec: dict) -> dict:
    by_id = {c["id"]: c for c in spec["cases"]}
    if "request_from" in case:
        request = copy.deepcopy(by_id[case["request_from"]]["request"])
        request.update(copy.deepcopy(case["patch"]))
    else:
        request = copy.deepcopy(case.get("request", {}))
    if feature == "checklist_suggestion":
        request["jobId"] = f"eval-job-{case['id']}"
        request["weather"] = [
            copy.deepcopy(spec["base_weather_mild"]) if w == "$mild" else w
            for w in request.get("weather", [])
        ]
    return request


# ---------- 채점 ----------


def _status_checks(expect: dict, status: int, body: dict) -> dict:
    checks = {"http_status": status == expect["status"]}
    if "error_code" in expect:
        checks["error_code"] = (body.get("error") or {}).get("code") == expect["error_code"]
    return checks


def check_preference(case: dict, request: dict, status: int, body: dict) -> dict:
    expect = case["expect"]
    checks = _status_checks(expect, status, body)
    if status != 200 or expect["status"] != 200:
        return checks
    items = (body.get("data") or {}).get("inferredItems")
    checks["schema"] = isinstance(items, list) and all(
        isinstance(i, dict) and isinstance(i.get("key"), str) and i.get("key") == i.get("value")
        for i in items
    )
    if not checks["schema"]:
        return checks
    keys = [i["key"] for i in items]
    excluded = {i["key"] for i in request.get("explicitItems", [])} | set(
        request.get("rejectedKeys", [])
    )
    checks["vocabulary"] = all(k in VOCABULARY for k in keys)
    checks["max_tags"] = len(keys) <= MAX_TAGS
    checks["no_duplicates"] = len(keys) == len(set(keys))
    checks["excluded_keys"] = not (set(keys) & excluded)
    if "exact" in expect:
        checks["expected_exact"] = keys == expect["exact"]
    if "include" in expect:
        checks["expected_include"] = all(k in keys for k in expect["include"])
    if "exclude" in expect:
        checks["expected_exclude"] = not (set(keys) & set(expect["exclude"]))
    return checks


def _overlaps(a: str, b: str) -> bool:
    a, b = normalize(a), normalize(b)
    return bool(a and b) and (a in b or b in a)


def check_checklist(case: dict, request: dict, status: int, body: dict) -> dict:
    expect = case["expect"]
    checks = _status_checks(expect, status, body)
    if status != 200 or expect["status"] != 200:
        return checks
    items = (body.get("data") or {}).get("items")
    checks["schema"] = isinstance(items, list) and all(
        isinstance(i, dict)
        and isinstance(i.get("label"), str)
        and isinstance(i.get("reason"), str)
        and i.get("sourceJobId") == request["jobId"]
        for i in items
    )
    if not checks["schema"]:
        return checks
    labels = [i["label"] for i in items]
    rule = expect["rule_labels"]
    checks["rule_labels"] = labels[: len(rule)] == rule
    if expect.get("rule_reasons"):
        reasons = {i["label"]: i["reason"] for i in items}
        checks["rule_reasons"] = all(reasons.get(k) == v for k, v in expect["rule_reasons"].items())
    checks["llm_extra_max2"] = len(labels) - len(rule) <= MAX_LLM_ITEMS
    user = [i["label"] for i in request.get("existingItems", [])] + request.get("deletedLabels", [])
    checks["no_user_overlap"] = not any(_overlaps(label, u) for label in labels for u in user)
    checks["no_internal_overlap"] = not any(
        _overlaps(a, b) for n, a in enumerate(labels) for b in labels[n + 1 :]
    )
    checks["length_limits"] = all(
        len(i["label"]) <= 30 and 0 < len(i["reason"]) <= 100 for i in items
    )
    if expect.get("forbidden"):
        words = [normalize(w) for w in expect["forbidden"]]
        checks["forbidden_free"] = not any(w in normalize(label) for label in labels for w in words)
    return checks


def check_place(case: dict, source_text: str, status: int, body: dict, label: dict | None) -> dict:
    expect = case["expect"]
    checks = _status_checks(expect, status, body)
    if status != 200 or expect["status"] != 200:
        return checks
    data = body.get("data") or {}
    candidates = data.get("candidates")
    checks["schema"] = (
        data.get("resultStatus") in STATUSES
        and isinstance(candidates, list)
        and all(_valid_candidate(c) for c in candidates)
    )
    if not checks["schema"]:
        return checks
    names = list(dict.fromkeys(c["name"] for c in candidates))
    keys = [normalize(n) for n in names]
    if label is not None:  # 캡처: 기존 장소 평가와 같은 채점
        scored = score_image(label, names)
        if scored["kind"] == "positive":
            checks["found_expected"] = scored["correct"]
        checks["no_unexpected"] = not scored["unexpected"]
        return checks
    checks["result_status"] = data["resultStatus"] in expect["status_any"]
    # 지어낸 장소 없음: 모든 언급이 준 글(페이지 글 + 메모)에 실제로 있어야 한다
    checks["grounded"] = all(k in source_text for k in keys)
    if "mentions" in expect:
        checks["mentions_found"] = all(
            any(normalize(alias) in keys for alias in group) for group in expect["mentions"]
        )
    if "max_mentions" in expect:
        checks["max_mentions"] = len(names) <= expect["max_mentions"]
    if expect.get("forbidden"):
        words = [normalize(w) for w in expect["forbidden"]]
        checks["forbidden_free"] = not any(w in k for k in keys for w in words)
    if "evidence" in expect:
        checks["evidence"] = all(c["evidence"] in expect["evidence"] for c in candidates)
    if "unmatched" in expect:
        targets = {normalize(n) for n in expect["unmatched"]}
        checks["unmatched_not_confirmed"] = not any(
            normalize(c["name"]) in targets and c["confidence"] == 1.0 for c in candidates
        )
    return checks


def _valid_candidate(c: object) -> bool:
    if not isinstance(c, dict) or not isinstance(c.get("name"), str):
        return False
    if c.get("evidence") not in EVIDENCE_TEXT.values():
        return False
    place, confidence = c.get("place"), c.get("confidence")
    if place is None:
        return confidence is None
    return (
        isinstance(confidence, int | float)
        and 0 <= confidence <= 1
        and all(k in place for k in ("name", "latitude", "longitude", "providerPlaceId"))
    )


# ---------- 실행 ----------


def git_sha() -> str:
    try:
        return subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=True
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


class Budget:
    def __init__(self, limit: int):
        self.limit = limit
        self.used = 0


async def run_feature(
    feature: str, run: int, client: httpx.AsyncClient, capture: LogCapture, ctx: dict
) -> None:
    spec = load_cases(feature)
    output = DATA / feature / "results" / f"{ctx['date']}.jsonl"
    output.parent.mkdir(parents=True, exist_ok=True)
    done = set()
    if output.exists():
        for line in output.read_text("utf-8").splitlines():
            row = json.loads(line)
            done.add((row["run"], row["case"]))
    labels = json.loads((DATA / "places" / "labels.json").read_text("utf-8"))["images"]
    with output.open("a", encoding="utf-8") as sink:
        for case in spec["cases"]:
            if (run, case["id"]) in done:
                continue
            if ctx["budget"].used >= ctx["budget"].limit:
                print(f"GMS 호출 상한 {ctx['budget'].limit}회에 닿아 중단", flush=True)
                return
            request, label, source_text = await _prepare(feature, case, spec, ctx, labels)
            capture.reset()
            started = time.perf_counter()
            response = await _send(feature, case, request, client)
            latency = round((time.perf_counter() - started) * 1000)
            ctx["budget"].used += capture.calls
            try:
                body = response.json()
            except ValueError:
                body = {"raw": response.text[:500]}
            if feature == "preference_inference":
                checks = check_preference(case, request, response.status_code, body)
            elif feature == "checklist_suggestion":
                checks = check_checklist(case, request, response.status_code, body)
            else:
                checks = check_place(case, source_text, response.status_code, body, label)
            row = {
                "run": run,
                "case": case["id"],
                "category": case["category"],
                "spec": case["spec"],
                "title": case["title"],
                "request": request,
                "status_code": response.status_code,
                "response": body,
                "latency_ms": latency,
                "llm_calls": capture.calls,
                "llm_failures": capture.failures,
                "prompt_tokens": capture.prompt_tokens,
                "completion_tokens": capture.completion_tokens,
                "events": capture.events,
                "checks": checks,
                "passed": all(checks.values()),
                "model": ctx["model"],
                "git_sha": ctx["sha"],
                "naver_configured": ctx["naver"],
            }
            sink.write(json.dumps(row, ensure_ascii=False) + "\n")
            sink.flush()
            failed = [name for name, ok in checks.items() if not ok]
            print(
                feature,
                f"run{run}",
                case["id"],
                "PASS" if row["passed"] else f"FAIL {failed}",
                f"{latency}ms calls={capture.calls}",
                flush=True,
            )


async def _prepare(feature, case, spec, ctx, labels):
    if feature != "place_extraction":
        return build_request(feature, case, spec), None, ""
    if "capture" in case:
        name = Path(case["capture"]).name
        return {"capture": case["capture"]}, labels[name], ""
    request = {k: case[k] for k in ("url", "memo", "regionHint") if k in case}
    # 지어낸 이름 검사용 원문. 앱이 LLM에 보내는 글과 같은 함수로 만든다
    text = ""
    try:
        page = await ctx["pages"].fetch(case["url"])
        text = _page_text(page)
    except LinkFetchError:
        pass
    return request, None, normalize(text) + normalize(case.get("memo", ""))


async def _send(feature, case, request, client):
    path = FEATURES[feature]
    headers = {"X-Internal-Token": EVAL_TOKEN, "X-Trace-Id": f"eval-{case['id']}"}
    if feature != "place_extraction":
        return await client.post(path, json=request, headers=headers)
    if "capture" in request:
        blob = (DATA / request["capture"]).read_bytes()
        files = [("captures", (Path(request["capture"]).name, blob, "image/jpeg"))]
        return await client.post(path, files=files, headers=headers)
    return await client.post(path, data=request, headers=headers)


async def run(features: list[str], run_no: int, max_calls: int) -> None:
    settings = Settings().model_copy(
        update={"internal_api_token": EVAL_TOKEN, "allow_no_internal_token": False}
    )
    app = create_app(settings)
    pages = {
        case["id"]: fixture_html(case["page"])
        for case in load_cases("place_extraction")["cases"]
        if "page" in case
    }
    link_http = httpx.AsyncClient(transport=FixtureTransport(pages))
    fetcher = PageMetaFetcher(
        link_http, timeout_seconds=settings.link_timeout_seconds, resolver=fixture_resolver
    )
    # main._build_place_extractor와 같고 링크 읽기만 고정 페이지를 아는 클라이언트를 쓴다
    app.state.place_extractor = PlaceExtractor(
        llm=_build_llm(settings, app.state.http),
        places=NaverLocalClient(
            app.state.http,
            client_id=settings.naver_client_id,
            client_secret=settings.naver_client_secret,
            timeout_seconds=settings.place_search_timeout_seconds,
        ),
        pages=fetcher,
    )
    capture = LogCapture()
    logging.getLogger("ai").addHandler(capture)
    ctx = {
        "date": date.today().isoformat(),
        "model": settings.llm_model,
        "sha": git_sha(),
        "naver": bool(settings.naver_client_id and settings.naver_client_secret),
        "pages": fetcher,
        "budget": Budget(max_calls),
    }
    print(f"model={ctx['model']} sha={ctx['sha']} naver_configured={ctx['naver']}", flush=True)
    transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(
            transport=transport, base_url="http://ai.local", timeout=60
        ) as client:
            for feature in features:
                await run_feature(feature, run_no, client, capture, ctx)
    finally:
        await link_http.aclose()
        await app.state.http.aclose()
    print(f"이번 실행의 GMS 호출 {ctx['budget'].used}회", flush=True)


# ---------- 요약 ----------


def percentile(values: list[float], q: float) -> float | None:
    """가까운 순위 방식. 표본이 작아 보간하지 않는다."""
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(math.ceil(q * len(ordered)) - 1, 0)]


def output_key(feature: str, row: dict) -> object:
    data = (row["response"] or {}).get("data")
    if data is None:
        return (
            "error",
            row["status_code"],
            ((row["response"] or {}).get("error") or {}).get("code"),
        )
    if feature == "preference_inference":
        return [i["key"] for i in data["inferredItems"]]
    if feature == "checklist_suggestion":
        return [i["label"] for i in data["items"]]
    return (data["resultStatus"], sorted({c["name"] for c in data["candidates"]}))


def summarize(feature: str, rows: list[dict]) -> dict:
    by_run: dict[int, list[dict]] = {}
    for row in rows:
        by_run.setdefault(row["run"], []).append(row)
    runs = {}
    for run_no, items in sorted(by_run.items()):
        checks: dict[str, list[int]] = {}
        for row in items:
            for name, ok in row["checks"].items():
                tally = checks.setdefault(name, [0, 0])
                tally[0] += bool(ok)
                tally[1] += 1
        llm_rows = [r for r in items if r["llm_calls"]]
        latencies = [r["latency_ms"] for r in llm_rows]
        runs[run_no] = {
            "cases": len(items),
            "passed": sum(r["passed"] for r in items),
            "failed_cases": [r["case"] for r in items if not r["passed"]],
            "checks": {k: f"{v[0]}/{v[1]}" for k, v in checks.items()},
            "llm_calls": sum(r["llm_calls"] for r in items),
            "llm_failures": sum(r["llm_failures"] for r in items),
            "llm_cases": len(llm_rows),
            "prompt_tokens": sum(r["prompt_tokens"] for r in items),
            "completion_tokens": sum(r["completion_tokens"] for r in items),
            "latency_ms_llm": {
                "median": statistics.median(latencies) if latencies else None,
                "p95": percentile(latencies, 0.95),
                "max": max(latencies) if latencies else None,
            },
            "latency_ms_all_median": statistics.median([r["latency_ms"] for r in items]),
            "by_category": _by_category(items),
        }
    result = {"feature": feature, "runs": runs}
    if len(by_run) >= 2:
        first, second = ({r["case"]: r for r in by_run[n]} for n in sorted(by_run)[:2])
        shared = sorted(set(first) & set(second))
        differ = [
            c for c in shared if output_key(feature, first[c]) != output_key(feature, second[c])
        ]
        flipped = [c for c in shared if first[c]["passed"] != second[c]["passed"]]
        result["stability"] = {
            "cases": len(shared),
            "same_output": len(shared) - len(differ),
            "different_output": differ,
            "pass_flipped": flipped,
        }
    return result


def _by_category(items: list[dict]) -> dict:
    out: dict[str, list[int]] = {}
    for row in items:
        tally = out.setdefault(row["category"], [0, 0])
        tally[0] += row["passed"]
        tally[1] += 1
    return {k: f"{v[0]}/{v[1]}" for k, v in out.items()}


def summarize_judgments(feature: str, day: str, cases: set[str] | None = None) -> dict | None:
    path = DATA / feature / "results" / f"{day}.claude_judgment.json"
    if not path.exists():
        return None
    judged = json.loads(path.read_text("utf-8"))["judgments"]
    out: dict[int, dict] = {}
    for item in judged:
        if cases is not None and item["case"] not in cases:
            continue
        tally = out.setdefault(item["run"], {"2": 0, "1": 0, "0": 0, "n": 0})
        tally[str(item["score"])] += 1
        tally["n"] += 1
    return out


def print_summary(features: list[str], day: str | None) -> None:
    total_calls = 0
    for feature in features:
        directory = DATA / feature / "results"
        files = sorted(directory.glob("*.jsonl")) if directory.exists() else []
        if day:
            files = [f for f in files if f.stem == day]
        if not files:
            print(json.dumps({"feature": feature, "rows": 0}, ensure_ascii=False))
            continue
        path = files[-1]
        rows = [json.loads(line) for line in path.read_text("utf-8").splitlines()]
        summary = summarize(feature, rows)
        summary["file"] = path.as_posix()
        summary["claude_judgment"] = summarize_judgments(feature, path.stem)
        if feature == "place_extraction":
            # 링크·메모 세트와 캡처 확인은 목적이 달라 따로 본다
            for name, keep in (("link_memo", False), ("image", True)):
                part = [r for r in rows if (r["category"] == "image") == keep]
                summary[name] = {
                    "runs": summarize(feature, part)["runs"],
                    "claude_judgment": summarize_judgments(
                        feature, path.stem, {r["case"] for r in part}
                    ),
                }
        total_calls += sum(r["llm_calls"] for r in rows)
        print(json.dumps(summary, ensure_ascii=False, indent=1))
    print(f"GMS 호출 합계 {total_calls}회")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", nargs="+", default=list(FEATURES), choices=list(FEATURES))
    parser.add_argument(
        "--run", type=int, default=1, help="회차 번호. 비결정성을 보려고 두 번 돌린다"
    )
    parser.add_argument("--max-calls", type=int, default=DEFAULT_MAX_CALLS)
    parser.add_argument("--summary", action="store_true", help="API 없이 저장된 결과만 요약")
    parser.add_argument("--date", help="요약할 결과 날짜(기본: 가장 최근 파일)")
    args = parser.parse_args()
    if args.summary:
        print_summary(args.features, args.date)
        return
    asyncio.run(run(args.features, args.run, args.max_calls))


if __name__ == "__main__":
    main()
