"""폰에 넣을 ONNX 두 개(사진 int8, 문장 4/8비트)로 평가 1,931장 분류 + 문장 검색을 잰다.

사진은 서비스와 같은 전처리(pixels_all.npz), 문장은 폰과 같은 JS 토크나이저 결과를 쓴다.
사용: python eval_search.py <image.onnx> <head.npz> <text.onnx> [<text.onnx> ...]
"""

import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort

HERE = Path(__file__).parent
SP = HERE.parent
img_path, head_path, text_paths = sys.argv[1], sys.argv[2], sys.argv[3:]

px = np.load(SP / "onnx/pixels_all.npz")
x, gold = px["px"].astype(np.float32), px["gold"]
files = json.load(open(HERE / "final/eval_files.json"))["files"]
caps = json.load(open(SP / "cap/cap_eval.json", encoding="utf-8"))
keep = [i for i, f in enumerate(files) if f in caps]
q = [caps[files[i]]["query"] for i in keep]
c = [caps[files[i]]["caption"] for i in keep]
tin, tout = HERE / "final/texts.json", HERE / "final/text_ids.json"
json.dump(q + c, open(tin, "w", encoding="utf-8"), ensure_ascii=False)
subprocess.run(["node", str(HERE / "tok_dump.mjs"), str(tin), str(tout)], check=True)
ids = np.array(json.load(open(tout)), dtype=np.int64)
qi, ci = ids[: len(q)], ids[len(q) :]


def sess(p):
    o = ort.SessionOptions()
    o.intra_op_num_threads = 4
    o.inter_op_num_threads = 1
    return ort.InferenceSession(str(p), o, providers=["CPUExecutionProvider"])


def norm(v):
    return v / np.linalg.norm(v, axis=1, keepdims=True)


def rmetrics(ti, ii):
    s = ti @ ii.T
    r = (s > np.diag(s)[:, None]).sum(1) + 1
    return {
        k: round(float((r <= n).mean()) * 100, 2) for k, n in (("R@1", 1), ("R@5", 5), ("R@10", 10))
    }


si = sess(img_path)
a = time.perf_counter()
img = norm(
    np.concatenate([si.run(None, {"pixels": x[i : i + 16]})[0] for i in range(0, len(x), 16)])
)
img_ms = (time.perf_counter() - a) * 1000 / len(x)
h = np.load(head_path)
pred = (img @ h["W"].T + h["B"]).argmax(1)
res = {
    "image": Path(img_path).name,
    "n_cls": len(x),
    "cls_acc": round(float((pred == gold).mean()) * 100, 2),
    "img_ms_per_photo_pc": round(img_ms, 1),
    "img_mb": round(Path(img_path).stat().st_size / 2**20, 1),
    "n_search": len(keep),
    "text": {},
}
ii = img[keep]
for tp in text_paths:
    st = sess(tp)
    tq = np.concatenate([st.run(None, {"ids": qi[i : i + 64]})[0] for i in range(0, len(qi), 64)])
    tc = np.concatenate([st.run(None, {"ids": ci[i : i + 64]})[0] for i in range(0, len(ci), 64)])
    t = []
    for _ in range(7):
        a = time.perf_counter()
        st.run(None, {"ids": qi[:1]})
        t.append((time.perf_counter() - a) * 1000)
    res["text"][Path(tp).name] = {
        "mb": round(Path(tp).stat().st_size / 2**20, 1),
        "ms_one_query_pc": round(float(np.median(t)), 1),
        "query": rmetrics(norm(tq), ii),
        "caption": rmetrics(norm(tc), ii),
    }
    print(Path(tp).name, res["text"][Path(tp).name], flush=True)
json.dump(res, open(HERE / "final/eval_search.json", "w"), indent=1)
print(json.dumps(res))
