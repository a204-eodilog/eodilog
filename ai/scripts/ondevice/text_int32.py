"""문장 ONNX 입력을 int32로 바꾼 사본을 만든다(안에서 int64로 Cast). 가중치는 그대로."""

import json
import sys

import numpy as np
import onnx
import onnxruntime as ort
from onnx import TensorProto, helper

src, dst = sys.argv[1], sys.argv[2]
m = onnx.load(src)
g = m.graph
inp = [i for i in g.input if i.name == "ids"][0]
inp.name = "ids32"
inp.type.tensor_type.elem_type = TensorProto.INT32
g.node.insert(
    0, helper.make_node("Cast", ["ids32"], ["ids"], to=TensorProto.INT64, name="ids_cast")
)
onnx.save(m, dst)
ids = np.array(json.load(open("ondev/final/text_ids.json"))[:32], dtype=np.int64)
a = ort.InferenceSession(src, providers=["CPUExecutionProvider"]).run(None, {"ids": ids})[0]
b = ort.InferenceSession(dst, providers=["CPUExecutionProvider"]).run(
    None, {"ids32": ids.astype(np.int32)}
)[0]
print("max abs diff", float(np.abs(a - b).max()), "ids max", int(ids.max()))
