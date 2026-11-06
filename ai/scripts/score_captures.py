"""캡처 평가 결과를 장소 단위로 채점한다. API를 부르지 않는다.

사용: uv run python -m scripts.score_captures RESULTS.jsonl [RESULTS.jsonl ...]
입력: eval_data/captures/labels.json, images/visible_text.json, eval_places가 남긴 결과 jsonl
출력: 표준 출력과 결과 파일 옆의 <이름>.summary.json

eval_places.score_image는 사진마다 대표 이름 하나를 맞혔는지만 본다. 캡처에는 장소가 여러 개라
여기서는 정답 장소마다 찾았는지 세고(재현율), 사진 전체가 맞았는지 따로 센다.
"""

import argparse
import json
import statistics
from pathlib import Path

from app.core.text import normalize

DATA = Path("eval_data/captures")
TYPES = ["detail", "list", "blog", "sns", "chat", "hard", "negative"]


def score_capture(label: dict, mentions: list[str], visible: list[str]) -> dict:
    """정답 장소마다 표기 하나와 정규화해서 완전히 같으면 찾은 것이다.

    정답이 아닌 이름 중 also_visible은 '장소 아닌 글자', 나머지는 unexpected다.
    unexpected가 화면 글자 안에 있으면 잘못 읽거나 일부만 읽은 것이고, 없으면 지어낸 이름 후보다.
    """
    names = {normalize(m): m for m in mentions}
    places = label["places"]
    found = [any(normalize(a) in names for a in aliases) for aliases in places]
    accepted = {normalize(a) for aliases in places for a in aliases}
    also = {normalize(a) for a in label["also_visible"]}
    screen = normalize(" ".join(visible))
    non_place = [m for k, m in names.items() if k not in accepted and k in also]
    unexpected = [m for k, m in names.items() if k not in accepted and k not in also]
    invented = [m for m in unexpected if normalize(m) not in screen]
    return {
        "type": label["type"],
        "expected_count": len(places),
        "found_count": sum(found),
        "missed": [aliases[0] for aliases, ok in zip(places, found, strict=True) if not ok],
        "non_place": non_place,
        "unexpected": unexpected,
        "invented": invented,
        # 사진 전체 정답: 장소를 모두 찾고 장소가 아닌 이름은 하나도 내지 않았다
        "exact": all(found) and not non_place and not unexpected,
    }


def summarize_type(rows: list[dict]) -> dict:
    expected = sum(r["expected_count"] for r in rows)
    found = sum(r["found_count"] for r in rows)
    return {
        "images": len(rows),
        "expected_names": expected,
        "found_names": found,
        "recall": round(found / expected, 4) if expected else None,
        "exact_images": sum(r["exact"] for r in rows),
        "images_with_non_place": sum(bool(r["non_place"]) for r in rows),
        "images_with_unexpected": sum(bool(r["unexpected"]) for r in rows),
        "invented_names": sum(len(r["invented"]) for r in rows),
        "errors": sum(bool(r.get("error")) for r in rows),
    }


def summarize(rows: list[dict]) -> dict:
    by_type = {t: summarize_type([r for r in rows if r["type"] == t]) for t in TYPES}
    positive = [r for r in rows if r["type"] != "negative"]
    negative = [r for r in rows if r["type"] == "negative"]
    seconds = sorted(r["seconds"] for r in rows if not r.get("error"))
    return {
        "by_type": by_type,
        "positive": summarize_type(positive),
        "negative_clean": sum(not r["mentions"] for r in negative),
        "negative_total": len(negative),
        "all": summarize_type(rows),
        "median_seconds": statistics.median(seconds) if seconds else None,
        "p90_seconds": seconds[int(0.9 * (len(seconds) - 1))] if seconds else None,
        "max_seconds": seconds[-1] if seconds else None,
    }


def score_file(path: Path, labels: dict, visible: dict) -> tuple[list[dict], dict]:
    raw = [json.loads(line) for line in path.read_text("utf-8").splitlines() if line.strip()]
    rows = []
    for row in raw:
        scored = score_capture(labels[row["file"]], row["mentions"], visible.get(row["file"], []))
        rows.append({**scored, **{k: row[k] for k in ("file", "mentions", "error", "seconds")}})
    missing = sorted(set(labels) - {r["file"] for r in rows})
    summary = summarize(rows)
    summary["missing_files"] = missing
    return rows, summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("results", nargs="+", type=Path)
    parser.add_argument("--data-dir", type=Path, default=DATA)
    args = parser.parse_args()
    labels = json.loads((args.data_dir / "labels.json").read_text("utf-8"))["images"]
    visible_path = args.data_dir / "images" / "visible_text.json"
    visible = json.loads(visible_path.read_text("utf-8")) if visible_path.exists() else {}
    for path in args.results:
        rows, summary = score_file(path, labels, visible)
        out = path.with_suffix(".summary.json")
        out.write_text(
            json.dumps({"summary": summary, "rows": rows}, ensure_ascii=False, indent=1), "utf-8"
        )
        print(path.name)
        print(json.dumps(summary, ensure_ascii=False, indent=1))
        for r in rows:
            if not r["exact"]:
                print(" ", r["file"], "놓침", r["missed"], "장소아님", r["non_place"],
                      "예상밖", r["unexpected"], "지어냄?", r["invented"])


if __name__ == "__main__":
    main()
