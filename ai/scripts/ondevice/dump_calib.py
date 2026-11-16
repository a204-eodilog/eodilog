"""int8 보정용: 학습셋(분류 학습 쪽, 검증 제외)에서 300장을 eval_view(256)로 뽑는다. 평가셋은 쓰지 않는다."""

import os
import sys

import numpy as np
import torch

sys.path.insert(0, os.path.expanduser("~/photo-train"))
import big

tr = big.cached("train")
tri, _ = big.split(len(tr["x"]), 1)
idx = tri[torch.randperm(len(tri), generator=torch.Generator().manual_seed(0))[:300]]
x = (
    (big.eval_view(tr["x"][idx].to(big.dev), 256) * 255)
    .round()
    .clamp(0, 255)
    .byte()
    .permute(0, 2, 3, 1)
    .cpu()
    .numpy()
)
np.savez_compressed(big.OUT + "/calib256.npz", x=x)
print("saved", x.shape)
