"""joint 모델을 int8 흉내 학습(QAT)하고, int8 흉내 상태에서 분류 + 문장 검색까지 잰다.

  qjoint.py <joint tag> <seed>
joint_<tag>.json이 아직 없으면(같은 밤 대기열에서 학습 중) 생길 때까지 기다린다.
결과: results/big/qat_joint_<tag>_s<seed>_pct.{pt,json}, qsearch_joint_<tag>_s<seed>.json
"""

import json
import os
import sys
import time

import torch

sys.path.insert(0, os.path.expanduser("~/photo-train"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import big  # noqa: E402
import joint  # noqa: E402
from big import OUT, dev, log  # noqa: E402

init, seed = sys.argv[1], int(sys.argv[2])
qtag = f"qat_joint_{init}_s{seed}_pct"
out = f"{OUT}/qsearch_joint_{init}_s{seed}.json"
if os.path.exists(out):
    log("SKIP", out)
    sys.exit(0)
for _ in range(720):  # 최대 6시간 기다림
    if os.path.exists(f"{OUT}/joint_{init}.json"):
        break
    time.sleep(30)
t0 = time.time()
if not os.path.exists(f"{OUT}/{qtag}.json"):
    big.run_qat(f"joint_{init}", seed)
t_qat = time.time() - t0

# int8 흉내 모델로 검색 평가: joint의 문장 인코더 + QAT 사진 인코더(입력 범위 고정)
t1 = time.time()
net = joint.Joint().to(dev)
ck = torch.load(f"{OUT}/joint_{init}.pt", map_location="cpu")
net.clip.load_state_dict({k: v.float() for k, v in ck["clip"].items()})
q = torch.load(f"{OUT}/{qtag}.pt", map_location="cpu")
qs = big.wrap_qat(net)
names = set(qs)
state = {}
for k, v in q["visual"].items():
    mod = k.rsplit(".", 1)[0]
    if mod in names:
        k = f"{mod}.lin.{k.rsplit('.', 1)[1]}"
    state[k] = v.float()
missing, unexpected = net.clip.visual.load_state_dict(state, strict=False)
assert not unexpected, unexpected[:5]
assert all(m.endswith(".scale") or m.endswith(".zp") for m in missing), [
    m for m in missing if not m.endswith((".scale", ".zp"))
][:5]
for name, r in q["ranges"].items():
    qs[name].scale.data.fill_(r["scale"])
    qs[name].zp.data.fill_(r["zero_point"])
net.head.load_state_dict(q["head"])
net.eval()


@torch.no_grad()
def img_emb_fp32(n, xu8, bs=256):
    # bf16 autocast를 끄고 잰다 (int8 흉내가 bf16으로 다시 뭉개지지 않게)
    return torch.cat(
        [n.img(big.eval_view(xu8[i : i + bs].to(dev), n.size)) for i in range(0, len(xu8), bs)]
    ).float()


joint.img_emb = img_emb_fp32
_, sets = big.data()
ex, eq, ec = joint.cap_eval()
ref = joint.Joint().to(dev)
ref.clip.load_state_dict({k: v.float() for k, v in ck["clip"].items()})
ref.head.load_state_dict({k: v.float() for k, v in ck["head"].items()})
ref.eval()
res = {
    "init": init,
    "seed": seed,
    "fp32": {"cls": joint.cls_eval(ref, sets), "search": joint.search_eval(ref, ex, eq, ec)},
    "int8_sim": {"cls": joint.cls_eval(net, sets), "search": joint.search_eval(net, ex, eq, ec)},
    "time_sec": {"qat_total": round(t_qat), "search_eval": round(time.time() - t1)},
}
json.dump(res, open(out, "w"), indent=1)
log("RESULT qsearch", json.dumps(res))
