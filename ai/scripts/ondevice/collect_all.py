"""results/big/*.json 실험 결과를 한 파일로 모은다(발표용 매트릭스)."""

import glob
import json
import os

OUT = os.path.expanduser("~/photo-train/results/big")
rows = []
for p in sorted(glob.glob(OUT + "/*.json")):
    name = os.path.basename(p)[:-5]
    if name.startswith(("cap_", "teacher_")) and name not in ("teacher_so400m_b12e10",):
        pass
    try:
        d = json.load(open(p, encoding="utf-8"))
    except Exception:
        continue
    if not isinstance(d, dict):
        continue
    flat = {}
    for k, v in d.items():
        if isinstance(v, (int, float, str, bool)) or v is None:
            flat[k] = v

    def pick(*path, d=d):
        x = d
        for k in path:
            if not isinstance(x, dict) or k not in x:
                return None
            x = x[k]
        return x

    m = {
        "cls": pick("cls", "eval1931")
        or pick("test", "cls", "eval1931")
        or pick("eval1931")
        or pick("qat_sim", "eval1931")
        or pick("fp32", "eval1931"),
        "legacy": pick("cls", "legacy") or pick("test", "cls", "legacy") or pick("legacy"),
        "q1": pick("search", "query", "R@1") or pick("test", "search", "query", "R@1"),
        "q5": pick("search", "query", "R@5") or pick("test", "search", "query", "R@5"),
        "q10": pick("search", "query", "R@10") or pick("test", "search", "query", "R@10"),
        "c5": pick("search", "caption", "R@5") or pick("test", "search", "caption", "R@5"),
        "val_acc": pick("val", "val_acc") if isinstance(d.get("val"), dict) else d.get("val"),
        "val_q5": pick("val", "val_search", "query", "R@5"),
        "val_c5": pick("val", "val_search", "caption", "R@5"),
    }
    rows.append({"name": name, "params": flat, "m": m, "mtime": os.path.getmtime(p)})
json.dump(rows, open(OUT + "/_all_results.json", "w"), ensure_ascii=False)
print("rows", len(rows))
