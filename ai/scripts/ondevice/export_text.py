"""문장 인코더를 줄인 단어표로 바꿔 ONNX(fp32 → int8 동적 양자화)로 내보내고 원본과 비교한다.

사용: (ai 폴더) uv run --extra vision --with onnx --with onnxruntime python export_text.py [joint.pt] [tag]
출력: ondev/out/text_<tag>_{fp32,int8}.onnx, text_<tag>.json
"""

import json
import sys
import time
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import open_clip
import torch
import torch.nn.functional as F
from torch import nn

HERE = Path(__file__).parent
OUT = HERE / "out"
CKPT = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] != "base" else None
TAG = sys.argv[2] if len(sys.argv) > 2 else "base"
torch.set_num_threads(8)

spec = json.load(open(OUT / "tokenizer.json", encoding="utf-8"))
model, _, _ = open_clip.create_model_and_transforms("ViT-B-32-SigLIP2-256", pretrained="webli")
if CKPT:
    ck = torch.load(CKPT, map_location="cpu")
    if "text" in ck:  # slim.py 결과: 문장 인코더만, 단어표는 줄인 행만
        st = {k: v.float() for k, v in ck["text"].items()}
        emb = model.text.token_embedding.weight.detach().clone()
        emb[torch.tensor(ck["orig_ids"])] = st.pop("text.token_embedding.weight")
        st["text.token_embedding.weight"] = emb
        assert ck["orig_ids"] == spec["origIds"]
    else:
        st = {k: v.float() for k, v in ck["clip"].items()}
    missing, unexpected = model.load_state_dict(st, strict=False)
    assert not unexpected, unexpected[:5]
    assert not [m for m in missing if m.startswith("text.")], missing[:5]
model.eval()
tok = open_clip.get_tokenizer("ViT-B-32-SigLIP2-256")


class QEmbedding(nn.Module):
    """단어 임베딩 표를 행마다 대칭 int8로 저장한다(ONNX: Gather int8 → Cast → Mul)."""

    def __init__(self, weight):
        super().__init__()
        scale = (weight.abs().amax(1, keepdim=True) / 127).clamp(min=1e-8)
        self.register_buffer("q", torch.round(weight / scale).clamp(-127, 127).to(torch.int8))
        self.register_buffer("scale", scale.float())

    def forward(self, ids):
        return self.q[ids].float() * self.scale[ids]


class TextEnc(nn.Module):
    def __init__(self, text, orig_ids):
        super().__init__()
        self.t = text
        emb = text.token_embedding.weight.detach()[torch.tensor(orig_ids)]
        self.t.token_embedding = QEmbedding(emb.clone())

    def forward(self, ids):
        return F.normalize(self.t(ids), dim=-1)


ref_texts = [r["text"] for r in json.load(open(OUT / "tok_ref.json", encoding="utf-8"))]
ref_ids = [r["ids"] for r in json.load(open(OUT / "tok_ref.json", encoding="utf-8"))]
# 비교는 줄인 단어표로 원본과 토큰이 같은 문장만 쓴다
ok = [i for i, r in enumerate(ref_ids) if -1 not in r]
sample = ok[:: max(1, len(ok) // 1500)][:1500]
with torch.no_grad():
    orig = F.normalize(model.encode_text(tok([ref_texts[i] for i in sample])), dim=-1).numpy()

enc = TextEnc(model.text, spec["origIds"]).eval()
ids = torch.tensor([ref_ids[i] for i in sample])
with torch.no_grad():
    trimmed = enc(ids).numpy()
print("trimmed torch vs original cos min", float((orig * trimmed).sum(1).min()))

fp32 = OUT / f"text_{TAG}_fp32.onnx"
torch.onnx.export(
    enc,
    ids[:2],
    str(fp32),
    input_names=["ids"],
    output_names=["embedding"],
    dynamic_axes={"ids": {0: "batch"}, "embedding": {0: "batch"}},
    opset_version=17,
    dynamo=False,
)
int8 = OUT / f"text_{TAG}_int8.onnx"
# 활성값까지 int8로 바꾸면(동적 양자화) 원본과 코사인 0.91로 떨어진다. 가중치만 8비트로 둔다.
from onnxruntime.quantization.matmul_nbits_quantizer import (
    DefaultWeightOnlyQuantConfig,
    MatMulNBitsQuantizer,
)

BITS = int(__import__("os").environ.get("BITS", "8"))
q = MatMulNBitsQuantizer(
    onnx.load(str(fp32)),
    algo_config=DefaultWeightOnlyQuantConfig(block_size=32, is_symmetric=True, bits=BITS),
)
q.process()
q.model.save_model_to_file(str(int8), use_external_data_format=False)


def run(path, x, threads=4):
    o = ort.SessionOptions()
    o.intra_op_num_threads = threads
    s = ort.InferenceSession(str(path), o, providers=["CPUExecutionProvider"])
    out = np.concatenate([s.run(None, {"ids": x[i : i + 64]})[0] for i in range(0, len(x), 64)])
    t = []
    for _ in range(5):
        a = time.perf_counter()
        s.run(None, {"ids": x[:1]})
        t.append((time.perf_counter() - a) * 1000)
    return out, round(float(np.median(t)), 1)


res = {"tag": TAG, "ckpt": CKPT, "vocab": len(spec["vocab"]), "n": len(sample)}
for name, p in (("fp32", fp32), ("int8", int8)):
    v, ms = run(p, ids.numpy().astype(np.int64))
    c = (v * orig).sum(1)
    res[name] = {
        "mb": round(p.stat().st_size / 2**20, 1),
        "cos_mean": round(float(c.mean()), 4),
        "cos_min": round(float(c.min()), 4),
        "ms_one_query": ms,
    }
    np.save(OUT / f"text_{TAG}_{name}_sample.npy", v)
np.save(OUT / f"text_{TAG}_orig_sample.npy", orig)
json.dump({"sample": sample}, open(OUT / f"text_{TAG}_sample_idx.json", "w"))
json.dump(res, open(OUT / f"text_{TAG}.json", "w"), indent=1)
print(json.dumps(res))
