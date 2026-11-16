"""폰용 사진 모델(int8 ONNX)로 '비슷한 사진 묶기' 기준값을 다시 맞춘다.

같은 사진 쌍: 평가 사진마다 연속 촬영처럼 살짝 바꾼 사본(잘라내기, 밝기, JPEG 압축, 작은 이동)을 만든다.
다른 사진 쌍: 평가 사진끼리 모든 쌍. 기준값 = 다른 사진 쌍이 잘못 묶이는 비율(FMR)이 1e-4·1e-5가 되는 유사도.
사용: python calibrate_group.py <eval256.npz> <photo_image_int8.onnx> <out.json>
"""

import io
import json
import sys

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageEnhance

EVAL, MODEL, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
rng = np.random.default_rng(0)
u8 = np.load(EVAL)["x"]  # (N, 256, 256, 3)


def variant(a: np.ndarray) -> np.ndarray:
    """연속 촬영에서 생길 만한 작은 차이: 5~12% 잘라 다시 키우기, 밝기 ±12%, JPEG 품질 60~85, 2~4% 이동"""
    im = Image.fromarray(a)
    w, h = im.size
    c = rng.uniform(0.05, 0.12)
    dx, dy = rng.uniform(-0.03, 0.03, 2)
    left = int(w * (c / 2 + max(dx, 0)))
    top = int(h * (c / 2 + max(dy, 0)))
    right = int(w * (1 - c / 2 + min(dx, 0)))
    bottom = int(h * (1 - c / 2 + min(dy, 0)))
    im = im.crop((left, top, right, bottom)).resize((w, h), Image.BICUBIC)
    im = ImageEnhance.Brightness(im).enhance(rng.uniform(0.88, 1.12))
    b = io.BytesIO()
    im.save(b, "JPEG", quality=int(rng.integers(60, 86)))
    return np.asarray(Image.open(b).convert("RGB"))


def embed(sess, imgs: np.ndarray) -> np.ndarray:
    x = ((imgs.astype(np.float32) / 255 - 0.5) / 0.5).transpose(0, 3, 1, 2)
    f = np.concatenate(
        [
            sess.run(None, {"pixels": np.ascontiguousarray(x[i : i + 32])})[0]
            for i in range(0, len(x), 32)
        ]
    )
    return f / np.linalg.norm(f, axis=1, keepdims=True)


sess = ort.InferenceSession(MODEL, providers=["CPUExecutionProvider"])
orig = embed(sess, u8)
var = embed(sess, np.stack([variant(a) for a in u8]))
pos = (orig * var).sum(1)
sim = orig @ orig.T
neg = sim[np.triu_indices(len(orig), 1)]

res = {
    "n_photos": int(len(orig)),
    "n_neg_pairs": int(len(neg)),
    "pos": {
        "min": round(float(pos.min()), 4),
        "p01": round(float(np.quantile(pos, 0.01)), 4),
        "median": round(float(np.median(pos)), 4),
    },
    "neg": {
        "p99": round(float(np.quantile(neg, 0.99)), 4),
        "p9999": round(float(np.quantile(neg, 1 - 1e-4)), 4),
        "max": round(float(neg.max()), 4),
    },
    "thresholds": {},
}
for name, fmr in (("fmr1e-4", 1e-4), ("fmr1e-5", 1e-5)):
    t = float(np.quantile(neg, 1 - fmr))
    res["thresholds"][name] = {
        "threshold": round(t, 4),
        "recall": round(float((pos >= t).mean()) * 100, 2),
    }
for t in (0.85, 0.88, 0.9, 0.92, 0.94):
    res["thresholds"][f"t{t}"] = {
        "threshold": t,
        "recall": round(float((pos >= t).mean()) * 100, 2),
        "false_pairs": int((neg >= t).sum()),
        "fmr": float((neg >= t).mean()),
    }
json.dump(res, open(OUT, "w"), indent=1)
print(json.dumps(res, indent=1))
