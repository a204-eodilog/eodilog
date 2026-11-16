"""평가 1,931장(gold_eval)을 학습 평가와 같은 eval_view(256, bicubic)로 uint8 npz로 뽑는다. 노트북 ONNX 평가용."""

import os
import sys

import numpy as np

sys.path.insert(0, os.path.expanduser("~/photo-train"))
import big

d = big.cached("gold_eval")
x = (
    (big.eval_view(d["x"].to(big.dev), 256) * 255)
    .round()
    .clamp(0, 255)
    .byte()
    .permute(0, 2, 3, 1)
    .cpu()
    .numpy()
)
np.savez_compressed(
    big.OUT + "/eval256.npz",
    x=x,
    y=d["y"].numpy(),
    files=np.array([os.path.basename(f) for f in d["files"]]),
)
print("saved", x.shape)
