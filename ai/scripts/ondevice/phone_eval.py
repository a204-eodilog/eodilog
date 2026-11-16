"""CNN 학생(cnnemb_<tag>.pt)을 ONNX로 내보내고 int8로 양자화한 뒤, 폰과 같은 조건으로 B-32와 나란히 잰다.

폰 조건: 사진 int8 ONNX + 폰 문장 모델(photo_text_w4_i32.onnx) + JS 토크나이저 id.
사진은 서버에서 뽑은 eval256.npz(학습 평가와 같은 bicubic 256)를 같은 방식으로 B-32와 CNN에 넣는다.
  uv run --with torch --with timm --with onnx --with onnxruntime --with numpy python -I phone_eval.py <cnnemb_tag.pt> [...]
결과: ondev-models/evaldata/phone_eval_<tag>.json
"""

import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort

ROOT = Path(__file__).resolve().parent.parent
EV = ROOT / "evaldata"
PH = ROOT / "final/phone"


def sess(p, threads=4):
    o = ort.SessionOptions()
    o.intra_op_num_threads = threads
    o.inter_op_num_threads = 1
    return ort.InferenceSession(str(p), o, providers=["CPUExecutionProvider"])


def norm(v):
    return v / np.linalg.norm(v, axis=1, keepdims=True)


def to_px(xu8):
    return ((xu8.astype(np.float32) / 255 - 0.5) / 0.5).transpose(0, 3, 1, 2).copy()


def rmetrics(ti, ii):
    s = ti @ ii.T
    r = (s > np.diag(s)[:, None]).sum(1) + 1
    return {
        k: round(float((r <= n).mean()) * 100, 2) for k, n in (("R@1", 1), ("R@5", 5), ("R@10", 10))
    }


def export(pt):
    import timm
    import torch
    import torch.nn.functional as F
    from torch import nn

    ck = torch.load(pt, map_location="cpu")

    class Student(nn.Module):
        def __init__(self):
            super().__init__()
            self.body = timm.create_model(ck["arch"], pretrained=False, num_classes=0)
            self.proj = nn.Linear(ck["state"]["proj.weight"].shape[1], 768)

        def forward(self, pixels):  # 입력은 이미 (x-0.5)/0.5
            return F.normalize(self.proj(self.body(pixels)), dim=-1)

    m = Student().eval()
    m.load_state_dict(ck["state"])
    fp32 = Path(pt).with_suffix(".fp32.onnx")
    torch.onnx.export(
        m,
        torch.zeros(1, 3, 256, 256),
        str(fp32),
        input_names=["pixels"],
        output_names=["features"],
        dynamic_axes={"pixels": {0: "B"}, "features": {0: "B"}},
        opset_version=17,
        dynamo=False,
    )
    return fp32


def quantize(fp32, method="minmax"):
    from onnxruntime.quantization import (
        CalibrationDataReader,
        CalibrationMethod,
        QuantFormat,
        QuantType,
        quantize_static,
    )
    from onnxruntime.quantization.shape_inference import quant_pre_process

    pre = fp32.with_name(fp32.name.replace(".fp32.onnx", ".pre.onnx"))
    quant_pre_process(str(fp32), str(pre))
    cal = to_px(np.load(EV / "calib256.npz")["x"])

    class Reader(CalibrationDataReader):
        def __init__(self):
            self.it = iter([{"pixels": cal[i : i + 1]} for i in range(len(cal))])

        def get_next(self):
            return next(self.it, None)

    out = fp32.with_name(fp32.name.replace(".fp32.onnx", f".int8_{method}.onnx"))
    cm = {
        "minmax": CalibrationMethod.MinMax,
        "pct": CalibrationMethod.Percentile,
        "entropy": CalibrationMethod.Entropy,
    }[method]
    extra = {"CalibPercentile": 99.99} if method == "pct" else {}
    quantize_static(
        str(pre),
        str(out),
        Reader(),
        quant_format=QuantFormat.QDQ,
        per_channel=True,
        calibrate_method=cm,
        activation_type=QuantType.QUInt8,
        weight_type=QuantType.QInt8,
        extra_options=extra,
    )
    return out


def text_ids(texts):
    tin, tout = EV / "_texts.json", EV / "_ids.json"
    json.dump(texts, open(tin, "w", encoding="utf-8"), ensure_ascii=False)
    subprocess.run(
        [
            "node",
            str(Path(__file__).parent / "tok_dump_any.mjs"),
            str(PH / "tokenizer.json"),
            str(tin),
            str(tout),
        ],
        check=True,
    )
    return np.array(json.load(open(tout)), dtype=np.int32)


def main(pts):
    d = np.load(EV / "eval256.npz")
    x, y, files = to_px(d["x"]), d["y"], [str(f) for f in d["files"]]
    caps = json.load(open(EV / "cap_eval.json", encoding="utf-8"))
    keep = [i for i, f in enumerate(files) if f in caps]
    q = [caps[files[i]]["query"] for i in keep]
    c = [caps[files[i]]["caption"] for i in keep]
    ids = text_ids(q + c)
    st = sess(PH / "photo_text_w4_i32.onnx")
    temb = norm(
        np.concatenate(
            [st.run(None, {"ids32": ids[i : i + 64]})[0] for i in range(0, len(ids), 64)]
        )
    )
    tq, tc = temb[: len(q)], temb[len(q) :]
    head = json.load(open(PH / "head.json"))
    W, B = np.array(head["W"], dtype=np.float32), np.array(head["B"], dtype=np.float32)

    def measure(img_onnx):
        si = sess(img_onnx)
        a = time.perf_counter()
        img = norm(
            np.concatenate(
                [si.run(None, {"pixels": x[i : i + 16]})[0] for i in range(0, len(x), 16)]
            )
        )
        batch_ms = (time.perf_counter() - a) * 1000 / len(x)
        one = []
        s1 = sess(img_onnx, threads=1)  # 폰처럼 한 장씩, 스레드 1개
        for i in range(12):
            a = time.perf_counter()
            s1.run(None, {"pixels": x[i : i + 1]})
            one.append((time.perf_counter() - a) * 1000)
        pred = (img @ W.T + B).argmax(1)
        ii = img[keep]
        return {
            "onnx": Path(img_onnx).name,
            "mb": round(Path(img_onnx).stat().st_size / 2**20, 1),
            "cls_acc": round(float((pred == y).mean()) * 100, 2),
            "n_cls": len(x),
            "query": rmetrics(tq, ii),
            "caption": rmetrics(tc, ii),
            "n_search": len(keep),
            "pc_ms_batch16_4thr": round(batch_ms, 1),
            "pc_ms_one_1thr": round(float(np.median(one[2:])), 1),
        }

    rows = [measure(PH / "photo_image_int8.onnx") | {"model": "B-32 joint (현재 폰 모델)"}]
    print(json.dumps(rows[-1], ensure_ascii=False), flush=True)
    for pt in pts:
        fp32 = export(pt)
        rows.append(measure(fp32) | {"model": Path(pt).stem + " fp32"})
        print(json.dumps(rows[-1], ensure_ascii=False), flush=True)
        for method in ("minmax", "pct", "entropy"):
            q8 = quantize(fp32, method)
            rows.append(measure(q8) | {"model": Path(pt).stem + f" int8 {method}"})
            print(json.dumps(rows[-1], ensure_ascii=False), flush=True)
    tag = "_".join(Path(p).stem.replace("cnnemb_", "") for p in pts) or "base"
    json.dump(
        rows,
        open(EV / f"phone_eval_{tag}.json", "w", encoding="utf-8"),
        indent=1,
        ensure_ascii=False,
    )


if __name__ == "__main__":
    main(sys.argv[1:])
