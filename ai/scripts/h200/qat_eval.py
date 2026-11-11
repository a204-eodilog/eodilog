"""H200 QAT 결과(.pt) → ONNX fp32 → ONNX Runtime 정적 int8(QDQ, QAT 입력 범위 그대로) → 평가 1,931장.

사용: (ai 폴더에서) PYTHONPATH=. uv run --extra vision --with onnx --with onnxruntime python <this> <scratchpad> <qat.pt|service> [skip3]
"""

import csv
import json
import sys
import time
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch
from onnxruntime.quantization import CalibrationDataReader, QuantFormat, QuantType, quantize_static

SP = Path(sys.argv[1])
SRC = sys.argv[2]
SKIP = len(sys.argv) > 3 and sys.argv[3] == "skip3"
import os

AT = os.environ.get("AT", "u8")
WT = os.environ.get("WT", "s8")
OUT = SP / "onnx"
TOPICS = ("LANDSCAPE", "FOOD", "PEOPLE", "OTHER")
torch.set_num_threads(4)

allpx = OUT / "pixels_all.npz"
if not allpx.exists():
    from app.core.config import Settings
    from app.features.photo_classification.embedder import SiglipEmbedder
    from app.features.photo_classification.service import _decode

    s = Settings()
    _, pre, _, _ = SiglipEmbedder(model_name=s.clip_model, pretrained=s.clip_pretrained)._load()
    rows = []
    for r in csv.DictReader(open(SP / "gold_eval.csv", encoding="utf-8")):
        for d in ("eval_aihub", "eval_104"):
            p = SP / d / "images" / r["file"]
            if p.exists():
                rows.append((p, r["topic"]))
                break
    px = np.stack([pre(_decode(p.read_bytes())).numpy() for p, _ in rows]).astype(np.float16)
    np.savez(allpx, px=px, gold=np.array([TOPICS.index(t) for _, t in rows]))
d = np.load(allpx)
px, gold = d["px"].astype(np.float32), d["gold"]
print("eval images", len(px), flush=True)

import open_clip  # noqa: E402

model, _, _ = open_clip.create_model_and_transforms("ViT-B-32-SigLIP2-256", pretrained="webli")
visual = model.visual.eval()
if SRC == "service":
    from safetensors.numpy import load_file

    t = load_file("app/features/photo_classification/photo_finetune.safetensors")
    visual.load_state_dict(
        {
            k[7:]: torch.from_numpy(v.astype(np.float32))
            for k, v in t.items()
            if k.startswith("visual.")
        },
        strict=False,
    )
    W, B = t["head.weight"].astype(np.float32), t["head.bias"].astype(np.float32)
    ranges, tag = {}, "service"
else:
    ck = torch.load(SRC, map_location="cpu")
    missing, unexpected = visual.load_state_dict(
        {k: v.float() for k, v in ck["visual"].items()}, strict=False
    )
    assert not unexpected, unexpected[:5]
    print("missing", missing[:5])
    W, B = ck["head"]["weight"].float().numpy(), ck["head"]["bias"].float().numpy()
    ranges, tag = ck["ranges"], Path(SRC).stem
tag += ("_skip3" if SKIP else "") + f"_{AT}{WT}_noout"

fp32 = OUT / f"{tag}_fp32.onnx"
torch.onnx.export(
    visual,
    torch.from_numpy(px[:2]),
    str(fp32),
    input_names=["pixels"],
    output_names=["features"],
    dynamic_axes={"pixels": {0: "batch"}, "features": {0: "batch"}},
    opset_version=17,
    dynamo=False,
)

m = onnx.load(str(fp32), load_external_data=False)
inits = {i.name for i in m.graph.initializer}
by_name = {n.name: n for n in m.graph.node}


def node_of(module):
    parts = module.split(".")  # trunk.blocks.5.mlp.fc2 / trunk.attn_pool.mlp.fc1
    if parts[1] == "blocks":
        path = ["trunk", "blocks", f"blocks.{parts[2]}", *parts[3:]]
    else:
        path = parts
    return "/" + "/".join(path) + "/MatMul"


wmm = [
    n.name
    for n in m.graph.node
    if n.op_type in ("MatMul", "Gemm") and any(i in inits for i in n.input)
]
skip = ("blocks.0/mlp/fc2", "blocks.5/mlp/fc2", "blocks.9/mlp/fc2") if SKIP else ()
nodes = [n for n in wmm if not any(s in n for s in skip)]
overrides = {}
for mod, r in ranges.items():
    nn_ = node_of(mod)
    assert nn_ in by_name, nn_
    if nn_ in nodes:
        zp = r["zero_point"] - (128 if AT == "s8" else 0)
        overrides[by_name[nn_].input[0]] = [
            {
                "scale": np.array(r["scale"], dtype=np.float32),
                "zero_point": np.array(zp, dtype=np.int8 if AT == "s8" else np.uint8),
            }
        ]
print("quant nodes", len(nodes), "range overrides", len(overrides), flush=True)


class Reader(CalibrationDataReader):
    def __init__(self, x):
        self.it = iter([{"pixels": x[i : i + 8]} for i in range(0, len(x), 8)])

    def get_next(self):
        return next(self.it, None)


int8 = OUT / f"{tag}_int8.onnx"
extra = {
    "WeightSymmetric": True,
    "OpTypesToExcludeOutputQuantization": ["MatMul"],
    "QDQOpTypePerChannelSupportToAxis": {"MatMul": int(__import__("os").environ.get("AXIS", "1"))},
}
if overrides:
    extra["TensorQuantOverrides"] = overrides
quantize_static(
    str(fp32),
    str(int8),
    Reader(px[::40][:48]),
    quant_format=QuantFormat.QDQ,
    per_channel=True,
    weight_type=QuantType.QUInt8 if WT == "u8" else QuantType.QInt8,
    activation_type=QuantType.QInt8 if AT == "s8" else QuantType.QUInt8,
    nodes_to_quantize=nodes,
    extra_options=extra,
)


def sess(p):
    o = ort.SessionOptions()
    o.intra_op_num_threads = 4
    o.inter_op_num_threads = 1
    return ort.InferenceSession(str(p), o, providers=["CPUExecutionProvider"])


def embed(s, x):
    v = np.concatenate([s.run(None, {"pixels": x[i : i + 16]})[0] for i in range(0, len(x), 16)])
    return v / np.linalg.norm(v, axis=1, keepdims=True)


res = {"tag": tag, "n": len(px)}
vec = {}
for name, p in (("fp32", fp32), ("int8", int8)):
    s = sess(p)
    v = embed(s, px)
    vec[name] = v
    t = []
    for _ in range(3):
        a = time.perf_counter()
        embed(s, px[:50])
        t.append(round(time.perf_counter() - a, 2))
    pred = (v @ W.T + B).argmax(1)
    res[name] = {
        "correct": int((pred == gold).sum()),
        "acc": round(float((pred == gold).mean()) * 100, 2),
        "t50": t,
        "mb": round(p.stat().st_size / 2**20, 1),
    }
    print(name, res[name], flush=True)
cos = (vec["fp32"] * vec["int8"]).sum(1)
res["cos_mean"], res["cos_min"] = round(float(cos.mean()), 4), round(float(cos.min()), 4)
res["agree"] = int(((vec["fp32"] @ W.T + B).argmax(1) == (vec["int8"] @ W.T + B).argmax(1)).sum())
json.dump(res, open(OUT / f"qat_{tag}.json", "w"), indent=1)
print(json.dumps(res))
fp32.unlink()  # 큰 파일은 지운다 (int8만 남김)
