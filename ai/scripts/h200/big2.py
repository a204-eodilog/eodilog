"""big.py 위에 얹은 실험 묶음. 인자는 key=value.

  big2.py teacher name=ViT-SO400M-16-SigLIP2-384 blocks=12 epochs=10 lr=1e-5 tag=so400m_b12
  big2.py student teachers=so400m,l,gopt seed=1 blocks=4 alpha=0.5 temp=2 epochs=6 tag=...
  big2.py qat init=service|<student tag>|bestkd seed=1 epochs=3 lr=3e-6 mode=pct tag=...
  big2.py audit teachers=so400m,l,gopt
결과: ~/photo-train/results/big/<tag>.json
"""

import glob
import json
import os
import sys

import big
import torch
import torch.nn.functional as F
from big import (
    OUT,
    STUDENT,
    Net,
    dev,
    embed,
    evaluate,
    fit_linear,
    log,
    set_trainable,
    split,
    train,
)
from torch import nn

TEACHER_FILES = {  # 첫 실행(big.py) 결과
    "l": ("ViT-L-16-SigLIP2-384", "teacher_L-16-384.pt"),
    "so400m": ("ViT-SO400M-16-SigLIP2-384", "teacher_SO400M-16-384.pt"),
    "gopt": ("ViT-gopt-16-SigLIP2-384", "teacher_gopt-16-384.pt"),
}


def done(tag):
    return os.path.exists(f"{OUT}/{tag}.json")


def load_teacher(key):
    if key in TEACHER_FILES:
        name, fname = TEACHER_FILES[key]
    else:
        import time

        for _ in range(240):  # 다른 GPU에서 선생을 학습 중이면 기다린다 (최대 2시간)
            if os.path.exists(f"{OUT}/teacher_{key}.json"):
                break
            time.sleep(30)
        meta = json.load(open(f"{OUT}/teacher_{key}.json"))
        name, fname = meta["model"], f"teacher_{key}.pt"
    net = Net(name).to(dev)
    net.load_state_dict(torch.load(f"{OUT}/{fname}", map_location=dev)["state"])
    for p in net.parameters():
        p.requires_grad = False
    return net.eval()


class Ensemble(nn.Module):
    def __init__(self, nets):
        super().__init__()
        self.nets = nn.ModuleList(nets)
        self.size = nets[0].size
        assert all(n.size == self.size for n in nets)

    def forward(self, x):
        return torch.stack([n(x).float() for n in self.nets]).mean(0)


def teachers(spec):
    nets = [load_teacher(k) for k in spec.split(",")]
    return nets[0] if len(nets) == 1 else Ensemble(nets).eval()


def finish(tag, res, net=None, extra=None):
    if net is not None:
        torch.save(
            {"state": {k: v.detach().cpu() for k, v in net.state_dict().items()}, **(extra or {})},
            f"{OUT}/{tag}.pt",
        )
    json.dump(res, open(f"{OUT}/{tag}.json", "w"), indent=1)
    log("RESULT", tag, json.dumps(res))


def job_teacher(name, blocks, epochs=6, lr=1e-5, seed=1, tag=None):
    tag = "teacher_" + tag
    tr, sets = big.data()
    net = Net(name).to(dev)
    set_trainable(net, int(blocks))
    tri, vai = split(len(tr["x"]), int(seed))
    fit_linear(net, embed(net, tr["x"][tri]), tr["y"][tri])
    info = train(
        net,
        tr["x"][tri],
        tr["y"][tri],
        tr["x"][vai],
        tr["y"][vai],
        epochs=int(epochs),
        lr=float(lr),
        seed=int(seed),
        tag=tag,
    )
    finish(
        tag,
        {
            "model": name,
            "blocks": int(blocks),
            "epochs": int(epochs),
            "lr": float(lr),
            **info,
            **evaluate(net, sets),
        },
        net,
    )


def job_student(
    seed=1, blocks=4, alpha=0.5, temp=2.0, epochs=6, lr=1e-5, teachers_=None, name=STUDENT, tag=None
):
    tr, sets = big.data()
    teacher = teachers(teachers_) if teachers_ else None
    net = Net(name).to(dev)
    set_trainable(net, int(blocks))
    tri, vai = split(len(tr["x"]), int(seed))
    fit_linear(net, embed(net, tr["x"][tri]), tr["y"][tri])
    info = train(
        net,
        tr["x"][tri],
        tr["y"][tri],
        tr["x"][vai],
        tr["y"][vai],
        epochs=int(epochs),
        lr=float(lr),
        seed=int(seed),
        teacher=teacher,
        alpha=float(alpha),
        temp=float(temp),
        tag=tag,
    )
    finish(
        tag,
        {
            "model": name,
            "teachers": teachers_,
            "seed": int(seed),
            "blocks": int(blocks),
            "alpha": float(alpha),
            "temp": float(temp),
            "epochs": int(epochs),
            **info,
            **evaluate(net, sets),
        },
        net,
    )


def best_student():
    """학습 사진의 검증 몫(val)으로만 고른다. 평가 1,931장으로 고르지 않는다."""
    rs = []
    for f in glob.glob(f"{OUT}/kd_*.json"):
        r = json.load(open(f))
        if r.get("model", STUDENT) == STUDENT and r.get("teachers"):
            rs.append((r["val"], os.path.basename(f)[:-5]))
    return max(rs)[1]


def job_qat(init="service", seed=1, epochs=3, lr=3e-6, mode="pct", tag=None):
    if init == "bestkd":
        init = best_student()
        log("bestkd", init)
    tr, sets = big.data()
    net = Net(STUDENT).to(dev)
    if init == "service":
        st = torch.load(big.SERVICE_PT, map_location=dev)
        net.visual.load_state_dict(st["visual"])
        net.head.load_state_dict(st["head"])
    else:
        net.load_state_dict(torch.load(f"{OUT}/{init}.pt", map_location=dev)["state"])
    fp_ref = Net(STUDENT).to(dev)
    fp_ref.load_state_dict(net.state_dict())
    for p in fp_ref.parameters():
        p.requires_grad = False
    fp_ref.eval()
    fp_res = evaluate(fp_ref, sets, amp=False)
    qs = big.wrap_qat(net)
    tri, vai = split(len(tr["x"]), int(seed))
    big.calibrate(net, qs, tr["x"][tri][::20], mode)
    ptq = evaluate(net, sets, amp=False)
    log(tag, "fp32", fp_res, "ptq_sim", ptq)
    set_trainable(net, 99)
    qparams = [p for q in qs.values() for p in (q.scale, q.zp)]
    for p in qparams:
        p.requires_grad = True
    info = train(
        net,
        tr["x"][tri],
        tr["y"][tri],
        tr["x"][vai],
        tr["y"][vai],
        epochs=int(epochs),
        lr=float(lr),
        seed=int(seed),
        extra_params=qparams,
        amp=False,
        fp_ref=fp_ref,
        tag=tag,
    )
    res = {
        "init": init,
        "seed": int(seed),
        "epochs": int(epochs),
        "lr": float(lr),
        "mode": mode,
        "fp32": fp_res,
        "ptq_sim": ptq,
        **info,
        "qat_sim": evaluate(net, sets, amp=False),
    }
    state = {
        k.replace(".lin.", "."): v.detach().half().cpu()
        for k, v in net.visual.state_dict().items()
        if not (k.endswith(".scale") or k.endswith(".zp"))
    }
    ranges = {
        n: {"scale": float(q.scale), "zero_point": int(round(float(q.zp.clamp(0, 255))))}
        for n, q in qs.items()
    }
    torch.save(
        {
            "visual": state,
            "head": {k: v.cpu() for k, v in net.head.state_dict().items()},
            "ranges": ranges,
        },
        f"{OUT}/{tag}.pt",
    )
    finish(tag, res)


@torch.no_grad()
def job_audit(teachers_="so400m,l,gopt", tag="audit"):
    """선생 앙상블이 정답과 다르게 본 사진 목록 (라벨 오류 후보, 사람 검토용)."""
    tr, sets = big.data()
    ens = teachers(teachers_)
    out = {}
    for name, d in [("train", tr), *sets.items()]:
        logits = big.logits(ens, d["x"], bs=128).float()
        p = F.softmax(logits / 1.0, 1).cpu()
        pred = p.argmax(1)
        rows = [
            {
                "file": d["files"][i].split("photo-train/")[-1],
                "gold": big.NAMES[int(d["y"][i])],
                "pred": big.NAMES[int(pred[i])],
                "p_pred": round(float(p[i].max()), 4),
                "p_gold": round(float(p[i, d["y"][i]]), 4),
            }
            for i in range(len(pred))
            if pred[i] != d["y"][i]
        ]
        rows.sort(key=lambda r: r["p_gold"])
        out[name] = {"n": len(pred), "disagree": len(rows), "rows": rows}
        log(tag, name, "disagree", len(rows), "/", len(pred))
    json.dump(out, open(f"{OUT}/{tag}.json", "w"), indent=1, ensure_ascii=False)
    log("RESULT", tag, {k: (v["disagree"], v["n"]) for k, v in out.items()})


if __name__ == "__main__":
    kind = sys.argv[1]
    kw = dict(a.split("=", 1) for a in sys.argv[2:])
    if "teachers" in kw:
        kw["teachers_"] = kw.pop("teachers")
    tag = kw.get("tag")
    if tag and done(tag if kind != "teacher" else "teacher_" + tag):
        log("SKIP", tag)
        sys.exit(0)
    {"teacher": job_teacher, "student": job_student, "qat": job_qat, "audit": job_audit}[kind](**kw)
