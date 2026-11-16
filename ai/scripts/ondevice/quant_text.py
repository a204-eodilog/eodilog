"""문장 인코더 fp32 ONNX에 여러 양자화를 해 보고 원본과의 코사인·크기·시간을 비교한다.
사용: quant_text.py <tag>"""

import json
import sys
import time
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
from onnxruntime.quantization import QuantType, quantize_dynamic

OUT = Path(__file__).parent / "out"
TAG = sys.argv[1]
fp32 = OUT / f"text_{TAG}_fp32.onnx"
orig = np.load(OUT / f"text_{TAG}_orig_sample.npy")
sample = json.load(open(OUT / f"text_{TAG}_sample_idx.json"))["sample"]
ref = json.load(open(OUT / "tok_ref.json", encoding="utf-8"))
ids = np.array([ref[i]["ids"] for i in sample], dtype=np.int64)
only = sys.argv[2:] or None


def variants():
    yield (
        "dyn_mm_pc",
        lambda o: quantize_dynamic(
            str(fp32),
            str(o),
            weight_type=QuantType.QInt8,
            op_types_to_quantize=["MatMul"],
            per_channel=True,
        ),
    )
    yield (
        "dyn_mm_pc_rr",
        lambda o: quantize_dynamic(
            str(fp32),
            str(o),
            weight_type=QuantType.QInt8,
            op_types_to_quantize=["MatMul"],
            per_channel=True,
            reduce_range=True,
        ),
    )
    yield (
        "dyn_mm_u8",
        lambda o: quantize_dynamic(
            str(fp32), str(o), weight_type=QuantType.QUInt8, op_types_to_quantize=["MatMul"]
        ),
    )

    def nbits(bits, block):
        def f(o):
            from onnxruntime.quantization.matmul_nbits_quantizer import (
                DefaultWeightOnlyQuantConfig,
                MatMulNBitsQuantizer,
            )

            m = onnx.load(str(fp32))
            cfg = DefaultWeightOnlyQuantConfig(block_size=block, is_symmetric=True, bits=bits)
            q = MatMulNBitsQuantizer(m, algo_config=cfg)
            q.process()
            q.model.save_model_to_file(str(o), use_external_data_format=False)

        return f

    yield "wo8_b32", nbits(8, 32)
    yield "wo4_b32", nbits(4, 32)

    def fp16(o):
        from onnxconverter_common import float16

        m = onnx.load(str(fp32))
        onnx.save(float16.convert_float_to_float16(m, keep_io_types=True), str(o))

    yield "fp16", fp16


res = {}
for name, make in variants():
    if only and name not in only:
        continue
    o = OUT / f"text_{TAG}_{name}.onnx"
    try:
        make(o)
        so = ort.SessionOptions()
        so.intra_op_num_threads = 4
        s = ort.InferenceSession(str(o), so, providers=["CPUExecutionProvider"])
        v = np.concatenate(
            [s.run(None, {"ids": ids[i : i + 64]})[0] for i in range(0, len(ids), 64)]
        )
        c = (v * orig).sum(1)
        t = []
        for _ in range(7):
            a = time.perf_counter()
            s.run(None, {"ids": ids[:1]})
            t.append((time.perf_counter() - a) * 1000)
        res[name] = {
            "mb": round(o.stat().st_size / 2**20, 1),
            "cos_mean": round(float(c.mean()), 4),
            "cos_min": round(float(c.min()), 4),
            "ms": round(float(np.median(t)), 1),
        }
    except Exception as e:  # noqa: BLE001
        res[name] = {"error": repr(e)[:200]}
    print(name, res[name], flush=True)
json.dump(res, open(OUT / f"quant_text_{TAG}.json", "w"), indent=1)
