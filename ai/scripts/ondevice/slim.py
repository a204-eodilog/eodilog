"""폰용 내보내기에 필요한 것만 작게 추린다 (GPU 안 씀).

  slim.py <joint tag>
출력 results/big/ondev_<tag>/: text.pt(문장 인코더, 줄인 단어표 행만, fp16), eval_files.json(평가 사진 순서·정답)
"""

import json
import os
import sys

import torch

H = os.path.expanduser("~/photo-train")
OUT = H + "/results/big"
tag = sys.argv[1]
dst = f"{OUT}/ondev_{tag}"
os.makedirs(dst, exist_ok=True)
spec = json.load(open(H + "/ondev/tokenizer.json", encoding="utf-8"))
ck = torch.load(f"{OUT}/joint_{tag}.pt", map_location="cpu")
text = {}
for k, v in ck["clip"].items():
    if k.startswith("visual."):
        continue
    if k == "text.token_embedding.weight":
        v = v[torch.tensor(spec["origIds"])]
    text[k] = v.half() if v.is_floating_point() else v
torch.save({"text": text, "orig_ids": spec["origIds"]}, f"{dst}/text.pt")
ev = torch.load(f"{OUT}/cache_gold_eval.pt")
json.dump(
    {"files": [os.path.basename(f) for f in ev["files"]], "y": ev["y"].tolist()},
    open(f"{dst}/eval_files.json", "w"),
)
print("saved", dst, os.path.getsize(f"{dst}/text.pt") // 2**20, "MB", len(ev["files"]))
