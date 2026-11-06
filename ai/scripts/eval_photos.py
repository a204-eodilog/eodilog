"""사진 분류 평가. 실제 SigLIP2 모델로 서비스 경로(`POST /ai/v1/photo-classifications`)를 부른다.

사용: uv run --extra vision python -m scripts.eval_photos [--skip-latency]
      uv run --extra vision python -m scripts.eval_photos --latency-only cold|warm [--repeats 5]
      uv run python -m scripts.eval_photos --summarize eval_data/photos/results/<날짜>.jsonl
입력: eval_data/photos/{images,labels.json}
출력: eval_data/photos/results/<날짜>.jsonl, <날짜>.summary.json
      <날짜>.latency.jsonl (--latency-only 결과, 이어 붙인다)

- 주제: 사진마다 요청 1건(1장)으로 보낸다. 요청마다 지연을 잰다.
- 묶음: labels.json의 `grouping_requests`대로 여러 장을 한 요청에 보낸다(최대 50장).
- 기준값 훑기는 참고용이다. 서비스와 같은 디코딩·같은 모델로 임베딩을 따로 구해 계산하고,
  0.94에서 API 결과와 같은지 확인한다. 서비스의 기준값은 바꾸지 않는다.
- 지연: 모델 로딩을 따로 재고, 4000px JPEG 50장을 한 요청으로 보낸다.
"""

import argparse
import datetime as dt
import io
import itertools
import json
import os
import platform
import subprocess
import time
from collections import Counter
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import Settings
from app.features.photo_classification import service as service_module
from app.main import create_app

DATA = Path("eval_data/photos")
PATH = "/ai/v1/photo-classifications"
TOKEN = "eval-token"
TOPIC_NAMES = ["LANDSCAPE", "FOOD", "PEOPLE", "OTHER"]
SWEEP = [0.90, 0.91, 0.92, 0.93, 0.94, 0.95, 0.96, 0.97]
LATENCY_SIDE = 4000
LATENCY_COUNT = 50
LATENCY_REPEATS = 3
LATENCY_KEYS = ("repeat", "count", "side", "total_bytes", "succeeded", "status", "seconds")


def load_labels() -> dict:
    return json.loads((DATA / "labels.json").read_text("utf-8"))


def describe(data: bytes) -> dict:
    with Image.open(io.BytesIO(data)) as image:
        return {"format": image.format, "width": image.width, "height": image.height}


def post(client: TestClient, items: list[tuple[str, str, bytes]]) -> tuple[dict, float, int]:
    """items: (photoId, 파일 이름, 바이트). 응답 본문, 걸린 초, 상태 코드."""
    files = [("files", (name, data, "application/octet-stream")) for _, name, data in items]
    meta = json.dumps({"photoIds": [photo_id for photo_id, _, _ in items]})
    started = time.perf_counter()
    response = client.post(
        PATH, data={"meta": meta}, files=files, headers={"X-Internal-Token": TOKEN}
    )
    return response.json(), time.perf_counter() - started, response.status_code


def git_sha() -> str:
    try:
        return subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=True
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def cpu_name() -> str:
    if platform.system() == "Windows":
        try:
            return subprocess.run(
                ["powershell", "-NoProfile", "-Command", "(Get-CimInstance Win32_Processor).Name"],
                capture_output=True,
                text=True,
                check=True,
            ).stdout.strip()
        except (OSError, subprocess.CalledProcessError):
            pass
    return platform.processor() or "unknown"


def to_large_jpeg(data: bytes) -> bytes:
    """긴 변을 4000px로 맞춘 JPEG. 휴대폰 원본 크기를 흉내 낸다(작으면 늘린다)."""
    with Image.open(io.BytesIO(data)) as image:
        image = image.convert("RGB")
        scale = LATENCY_SIDE / max(image.size)
        resized = image.resize((round(image.width * scale), round(image.height * scale)))
    buffer = io.BytesIO()
    resized.save(buffer, "JPEG", quality=90)
    return buffer.getvalue()


def env_row(settings: Settings) -> dict:
    import torch

    return {
        "kind": "env",
        "git_sha": git_sha(),
        "model": settings.clip_model,
        "pretrained": settings.clip_pretrained,
        "threshold": settings.photo_similarity_threshold,
        "max_side": service_module.MAX_SIDE,
        "request_budget_seconds": settings.request_budget_seconds,
        "cpu": cpu_name(),
        "logical_cpus": os.cpu_count(),
        "torch": torch.__version__,
        "torch_threads": torch.get_num_threads(),
        "cuda": torch.cuda.is_available(),
        "python": platform.python_version(),
        "os": platform.platform(),
        "hf_hub_offline": os.environ.get("HF_HUB_OFFLINE", ""),
    }


def large_batch() -> list[tuple[str, str, bytes]]:
    """주제 평가에 쓰는 원본 사진 앞 50장을 4000px JPEG로 바꾼다."""
    originals = [item for item in load_labels()["images"] if not item.get("variant_of")]
    return [
        (
            item["id"],
            f"{item['id']}.jpg",
            to_large_jpeg((DATA / "images" / item["file"]).read_bytes()),
        )
        for item in originals[:LATENCY_COUNT]
    ]


def run_latency(mode: str, repeats: int) -> Path:
    """새 프로세스에서 지연만 잰다.

    cold: 모델을 미리 올리지 않고 첫 요청으로 50장을 보낸다(배포 직후 첫 요청).
    warm: 모델 로딩을 따로 잰 뒤 50장 요청을 여러 번 보낸다.
    """
    large = large_batch()
    settings = Settings(internal_api_token=TOKEN)
    app = create_app(settings)
    embedder = app.state.photo_classifier._embedder
    rows = [env_row(settings)]
    with TestClient(app) as client:
        if mode == "warm":
            started = time.perf_counter()
            embedder._load()
            rows.append({"kind": "model_load", "seconds": time.perf_counter() - started})
            started = time.perf_counter()
            embedder.embed_texts(["warmup"])
            rows.append({"kind": "text_warmup", "seconds": time.perf_counter() - started})
        for repeat in range(1 if mode == "cold" else repeats):
            body, seconds, status = post(client, large)
            photos = body.get("data", {}).get("photos", [])
            rows.append(
                {
                    "kind": f"latency_50_{mode}",
                    "repeat": repeat,
                    "count": len(large),
                    "side": LATENCY_SIDE,
                    "total_bytes": sum(len(d) for _, _, d in large),
                    "succeeded": sum(p["status"] == "SUCCEEDED" for p in photos),
                    "status": status,
                    "error": body.get("error"),
                    "seconds": seconds,
                }
            )
            print(f"{mode} 50장 #{repeat}: {status} {seconds:.2f}s")
    output = DATA / "results" / f"{dt.date.today().isoformat()}.latency.jsonl"
    output.parent.mkdir(exist_ok=True)
    with output.open("a", encoding="utf-8") as f:
        f.writelines(json.dumps(r, ensure_ascii=False) + "\n" for r in rows)
    return output


def run(skip_latency: bool) -> Path:
    labels = load_labels()
    images = {item["id"]: item for item in labels["images"]}
    payload = {
        item_id: (DATA / "images" / item["file"]).read_bytes() for item_id, item in images.items()
    }

    settings = Settings(internal_api_token=TOKEN)
    app = create_app(settings)
    classifier = app.state.photo_classifier
    embedder = classifier._embedder
    output = DATA / "results" / f"{dt.date.today().isoformat()}.jsonl"
    output.parent.mkdir(exist_ok=True)
    rows: list[dict] = []

    rows.append(env_row(settings))

    with TestClient(app) as client:
        started = time.perf_counter()
        embedder._load()
        rows.append({"kind": "model_load", "seconds": time.perf_counter() - started})

        # 첫 요청은 주제 문장 임베딩을 함께 만든다. 따로 기록하고 주제 지연 통계에서는 뺀다
        first_id = next(iter(images))
        body, seconds, status = post(
            client, [(first_id, images[first_id]["file"], payload[first_id])]
        )
        rows.append({"kind": "warmup", "id": first_id, "seconds": seconds, "status": status})

        for item_id, item in images.items():
            body, seconds, status = post(client, [(item_id, item["file"], payload[item_id])])
            photo = body["data"]["photos"][0] if status == 200 else None
            rows.append(
                {
                    "kind": "photo",
                    "id": item_id,
                    "file": item["file"],
                    "bytes": len(payload[item_id]),
                    **describe(payload[item_id]),
                    "expected": item["topic"],
                    "hard": item.get("hard"),
                    "variant_of": item.get("variant_of"),
                    "status": status,
                    "photo_status": photo["status"] if photo else None,
                    "topic": photo["topics"][0] if photo and photo["topics"] else None,
                    "error_code": photo["errorCode"] if photo else body.get("error"),
                    "seconds": seconds,
                }
            )
            print(f"{item_id} {item['topic']:>9} -> {rows[-1]['topic']} {seconds:.2f}s")

        for request in labels["grouping_requests"]:
            ids = request["ids"]
            body, seconds, status = post(client, [(i, images[i]["file"], payload[i]) for i in ids])
            predicted = {p["photoId"]: p["groupId"] for p in body["data"]["photos"]}
            vectors = embedder.embed_images(
                [service_module._decode(payload[i]) for i in ids]  # 서비스와 같은 디코딩
            )
            similarity = vectors @ vectors.T
            rows.append(
                {
                    "kind": "grouping",
                    "name": request["name"],
                    "ids": ids,
                    "expected_group": {i: images[i].get("group") for i in ids},
                    "predicted_group": predicted,
                    "similarity": {
                        f"{a}|{b}": float(similarity[x, y])
                        for (x, a), (y, b) in itertools.combinations(enumerate(ids), 2)
                    },
                    "status": status,
                    "seconds": seconds,
                }
            )
            print(f"grouping {request['name']}: {len(ids)}장 {seconds:.2f}s")

        if not skip_latency:
            large = large_batch()
            for repeat in range(LATENCY_REPEATS):
                body, seconds, status = post(client, large)
                ok = sum(p["status"] == "SUCCEEDED" for p in body["data"]["photos"])
                rows.append(
                    {
                        "kind": "latency_50",
                        "repeat": repeat,
                        "count": len(large),
                        "side": LATENCY_SIDE,
                        "total_bytes": sum(len(d) for _, _, d in large),
                        "succeeded": ok,
                        "status": status,
                        "seconds": seconds,
                    }
                )
                print(f"latency 50장 #{repeat}: {seconds:.2f}s")

    output.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), "utf-8")
    return output


def pairwise(expected: dict, predicted: dict) -> dict:
    """같은 묶음 쌍 기준 정밀도·재현율. 값이 None이면 어느 묶음에도 속하지 않는다."""
    tp = fp = fn = 0
    for a, b in itertools.combinations(sorted(expected), 2):
        same_expected = expected[a] is not None and expected[a] == expected[b]
        same_predicted = predicted[a] is not None and predicted[a] == predicted[b]
        tp += same_expected and same_predicted
        fp += same_predicted and not same_expected
        fn += same_expected and not same_predicted
    precision = tp / (tp + fp) if tp + fp else None
    recall = tp / (tp + fn) if tp + fn else None
    f1 = 2 * precision * recall / (precision + recall) if precision and recall else 0.0
    return {"tp": tp, "fp": fp, "fn": fn, "precision": precision, "recall": recall, "f1": f1}


def threshold_groups(ids: list[str], similarity: dict, threshold: float) -> dict:
    """service.group_similar와 같은 연결 규칙(이어진 사진은 한 묶음)."""
    parent = {i: i for i in ids}

    def root(i: str) -> str:
        while parent[i] != i:
            i = parent[i]
        return i

    for key, value in similarity.items():
        a, b = key.split("|")
        if value >= threshold:
            parent[root(a)] = root(b)
    roots = [root(i) for i in ids]
    sizes = Counter(roots)
    return {i: (r if sizes[r] > 1 else None) for i, r in zip(ids, roots, strict=True)}


def scoped(name: str, groups: dict) -> dict:
    """요청마다 groupId가 새로 나오므로 요청 이름을 붙여 합친다."""
    return {f"{name}/{i}": (v and f"{name}/{v}") for i, v in groups.items()}


def summarize(path: Path) -> dict:
    rows = [json.loads(line) for line in path.read_text("utf-8").splitlines()]
    env = next(r for r in rows if r["kind"] == "env")
    # 파생본은 원본과 거의 같은 사진이라 주제 정확도에서 빼고 원본과 같은 답인지만 본다
    every_photo = [r for r in rows if r["kind"] == "photo"]
    photos = [r for r in every_photo if not r.get("variant_of")]
    by_id = {r["id"]: r for r in every_photo}
    variants = [r for r in every_photo if r.get("variant_of")]
    correct = [r for r in photos if r["topic"] == r["expected"]]
    confusion = {e: {p: 0 for p in TOPIC_NAMES} for e in TOPIC_NAMES}
    for r in photos:
        if r["topic"] in TOPIC_NAMES:
            confusion[r["expected"]][r["topic"]] += 1
    per_class = {}
    for name in TOPIC_NAMES:
        tp = confusion[name][name]
        predicted = sum(confusion[e][name] for e in TOPIC_NAMES)
        actual = sum(confusion[name].values())
        per_class[name] = {
            "support": actual,
            "precision": tp / predicted if predicted else None,
            "recall": tp / actual if actual else None,
        }
    hard = [r for r in photos if r["hard"]]
    seconds = sorted(r["seconds"] for r in every_photo)

    grouping = [r for r in rows if r["kind"] == "grouping"]
    expected_all: dict = {}
    predicted_all: dict = {}
    sweep = {t: {} for t in SWEEP}
    consistent = True
    for g in grouping:
        expected_all |= scoped(g["name"], g["expected_group"])
        predicted_all |= scoped(g["name"], g["predicted_group"])
        for t in SWEEP:
            sweep[t] |= scoped(g["name"], threshold_groups(g["ids"], g["similarity"], t))
        at_service = threshold_groups(g["ids"], g["similarity"], env["threshold"])
        api = g["predicted_group"]
        if pairwise(at_service, api)["fp"] or pairwise(api, at_service)["fp"]:
            consistent = False
    pair_scores = {"same": [], "different": []}
    for g in grouping:
        for key, value in g["similarity"].items():
            a, b = key.split("|")
            ea, eb = g["expected_group"][a], g["expected_group"][b]
            pair_scores["same" if ea is not None and ea == eb else "different"].append((key, value))

    latency = [r for r in rows if r["kind"] == "latency_50"]
    return {
        "source": path.name,
        "env": env,
        "model_load_seconds": next(r["seconds"] for r in rows if r["kind"] == "model_load"),
        "warmup_seconds": next(r["seconds"] for r in rows if r["kind"] == "warmup"),
        "topic": {
            "total": len(photos),
            "correct": len(correct),
            "accuracy": len(correct) / len(photos),
            "failed_requests": sum(r["topic"] is None for r in photos),
            "hard_total": len(hard),
            "hard_correct": sum(r["topic"] == r["expected"] for r in hard),
            "per_class": per_class,
            "confusion": confusion,
            "variants_total": len(variants),
            "variants_same_as_source": sum(
                r["topic"] == by_id[r["variant_of"]]["topic"] for r in variants
            ),
            "wrong": [
                {k: r[k] for k in ("id", "file", "expected", "topic", "hard")}
                for r in photos
                if r["topic"] != r["expected"]
            ],
        },
        "single_request_seconds": {
            "count": len(seconds),
            "median": seconds[len(seconds) // 2],
            "p90": seconds[int(len(seconds) * 0.9)],
            "max": seconds[-1],
        },
        "grouping": {
            "photos": len(expected_all),
            "expected_groups": len({v for v in expected_all.values() if v}),
            "predicted_groups": len({v for v in predicted_all.values() if v}),
            "at_service": pairwise(expected_all, predicted_all),
            "sweep_matches_api_at_service_threshold": consistent,
            "sweep": {str(t): pairwise(expected_all, sweep[t]) for t in SWEEP},
            "min_same_pair": min(pair_scores["same"], key=lambda x: x[1], default=None),
            "max_different_pair": max(pair_scores["different"], key=lambda x: x[1], default=None),
            "different_pairs_top5": sorted(pair_scores["different"], key=lambda x: -x[1])[:5],
            "same_pairs_bottom5": sorted(pair_scores["same"], key=lambda x: x[1])[:5],
        },
        "latency_50": [{k: r[k] for k in LATENCY_KEYS} for r in latency],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--summarize", type=Path, help="저장된 결과만 다시 집계한다")
    parser.add_argument("--skip-latency", action="store_true")
    parser.add_argument("--latency-only", choices=["cold", "warm"])
    parser.add_argument("--repeats", type=int, default=5)
    args = parser.parse_args()
    if args.latency_only:
        print(run_latency(args.latency_only, args.repeats))
        return
    path = args.summarize or run(args.skip_latency)
    summary = summarize(path)
    path.with_suffix(".summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=1), "utf-8"
    )
    shown = {k: summary[k] for k in ("topic", "grouping", "latency_50")}
    print(json.dumps(shown, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
