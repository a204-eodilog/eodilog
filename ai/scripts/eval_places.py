"""장소 추출 평가. 실제 GMS·네이버를 호출한다 (작업 6).

사용: uv run python -m scripts.eval_places [--models gpt-5.6-luna gpt-4.1 gpt-5.5]
입력: eval_data/places/{images,labels.json} (--data-dir로 다른 세트를 줄 수 있다)
출력: <data-dir>/results/<모델>.jsonl (이미 있는 사진은 건너뛰므로 이어서 돌릴 수 있다)
"""

import argparse
import asyncio
import json
import statistics
import time
from pathlib import Path

import httpx

from app.clients.errors import ProviderUnavailable
from app.core.config import Settings
from app.features.place_extraction.service import ExtractionInput, normalize
from app.main import _build_place_extractor

DATA = Path("eval_data/places")
DEFAULT_MODELS = ["gpt-5.6-luna", "gpt-4.1", "gpt-5.5"]
MAX_CONSECUTIVE_ERRORS = 5


def score_image(label: dict, mentions: list[str]) -> dict:
    """이름은 정규화한 뒤 표기 하나와 완전히 같아야 정답이다. 일부만 읽은 이름은 오답이다."""
    expected = {normalize(name) for name in label["expected"]}
    known = expected | {normalize(name) for name in label["also_visible"]}
    # 정답표에 없는 이름. 지어낸 것인지 사진에 실제로 있는 글자인지는 사람이 사진을 보고 가른다
    unexpected = [m for m in mentions if normalize(m) not in known]
    is_negative = not expected
    return {
        "kind": "negative" if is_negative else "positive",
        "uncertain": bool(label.get("uncertain")),
        "correct": not unexpected
        if is_negative
        else any(normalize(m) in expected for m in mentions),
        "unexpected": unexpected,
    }


def rescore(row: dict, label: dict) -> dict:
    """정답표를 고친 뒤 API를 다시 부르지 않고 저장된 응답을 다시 채점한다."""
    return {**row, **score_image(label, row["mentions"])}


def summarize(rows: list[dict]) -> dict:
    positive = [r for r in rows if r["kind"] == "positive"]
    negative = [r for r in rows if r["kind"] == "negative"]
    confirmed = [r for r in positive if not r["uncertain"]]
    seconds = [r["seconds"] for r in rows if not r["error"]]
    return {
        "positive_correct": sum(r["correct"] for r in positive),
        "positive_total": len(positive),
        "confirmed_correct": sum(r["correct"] for r in confirmed),
        "confirmed_total": len(confirmed),
        "negative_clean": sum(r["correct"] for r in negative),
        "negative_total": len(negative),
        "unexpected_images": sum(bool(r["unexpected"]) for r in rows),
        "errors": sum(bool(r["error"]) for r in rows),
        "median_seconds": statistics.median(seconds) if seconds else None,
        "max_seconds": max(seconds) if seconds else None,
    }


async def evaluate_model(
    http: httpx.AsyncClient, settings: Settings, model: str, limit: int | None, data: Path = DATA
) -> list[dict]:
    labels = json.loads((data / "labels.json").read_text("utf-8"))["images"]
    output = data / "results" / f"{model}.jsonl"
    output.parent.mkdir(exist_ok=True)
    rows = (
        [json.loads(line) for line in output.read_text("utf-8").splitlines()]
        if output.exists()
        else []
    )
    done = {row["file"] for row in rows if not row["error"]}
    rows = [row for row in rows if not row["error"]]
    extractor = _build_place_extractor(settings.model_copy(update={"llm_model": model}), http)
    consecutive_errors = 0
    with output.open("w", encoding="utf-8") as sink:
        for row in rows:
            sink.write(json.dumps(row, ensure_ascii=False) + "\n")
        pending = [item for item in sorted(labels.items()) if item[0] not in done]
        for name, label in pending[:limit]:
            started = time.monotonic()
            error, mentions, with_place = None, [], 0
            try:
                result = await extractor.extract(
                    ExtractionInput(None, [(data / "images" / name).read_bytes()], None, None)
                )
                mentions = list(dict.fromkeys(c.name for c in result.candidates))
                with_place = len({c.name for c in result.candidates if c.place})
            except ProviderUnavailable as e:
                error = type(e).__name__
            row = {
                "file": name,
                **score_image(label, mentions),
                "mentions": mentions,
                "with_place": with_place,
                "error": error,
                "seconds": round(time.monotonic() - started, 2),
            }
            rows.append(row)
            sink.write(json.dumps(row, ensure_ascii=False) + "\n")
            sink.flush()
            print(model, name, "O" if row["correct"] else "X", mentions, error or "", flush=True)
            consecutive_errors = consecutive_errors + 1 if error else 0
            if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                print(model, f"연속 실패 {consecutive_errors}회, 이 모델을 중단", flush=True)
                break
    return rows


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", nargs="+", default=DEFAULT_MODELS)
    parser.add_argument("--limit", type=int, help="모델마다 새로 평가할 사진 수")
    parser.add_argument(
        "--no-places", action="store_true", help="장소 검색을 호출하지 않고 이름 인식만 잰다"
    )
    parser.add_argument("--rescore", action="store_true", help="API 없이 저장된 응답만 다시 채점")
    parser.add_argument(
        "--data-dir", type=Path, default=DATA, help="images/와 labels.json이 있는 평가 세트 폴더"
    )
    return parser.parse_args(argv)


async def main() -> None:
    args = parse_args()
    data = args.data_dir
    if args.rescore:
        labels = json.loads((data / "labels.json").read_text("utf-8"))["images"]
        for model in args.models:
            lines = (data / "results" / f"{model}.jsonl").read_text("utf-8").splitlines()
            rows = [json.loads(line) for line in lines]
            rows = [rescore(row, labels[row["file"]]) for row in rows]
            print(json.dumps({"model": model, **summarize(rows)}, ensure_ascii=False))
            for row in rows:
                if not row["correct"] or row["unexpected"]:
                    print(" ", row["file"], "O" if row["correct"] else "X", row["mentions"])
        return
    settings = Settings()
    if args.no_places:
        settings = settings.model_copy(update={"naver_client_id": "", "naver_client_secret": ""})
    async with httpx.AsyncClient() as http:
        for model in args.models:
            rows = await evaluate_model(http, settings, model, args.limit, data)
            print(json.dumps({"model": model, **summarize(rows)}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
