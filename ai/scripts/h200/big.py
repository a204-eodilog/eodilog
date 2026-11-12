"""GPU 3번 한 장으로: 큰 선생 모델 파인튜닝 → 지식 증류(B-32 학생) → int8 양자화 인식 학습(QAT).

CPU를 아끼려고 사진은 한 번만 풀어(작업자 2개) 400x400 uint8로 GPU에 올리고, 증강은 GPU에서 한다.
사용:
  big.py cache
  big.py teacher <open_clip 이름> <풀 블록 수>
  big.py kd <선생 이름> <seed> <학생 블록 수>
  big.py qat <init: service|kd 결과 이름> <seed>
결과: ~/photo-train/results/big/
"""

import ast
import csv
import json
import math
import os
import random
import sys
import time

import numpy as np
import open_clip
import torch
import torch.nn.functional as F
from PIL import Image
from torch import nn
from torch.utils.data import DataLoader, Dataset
from torchvision.ops import roi_align

H = os.path.expanduser("~/photo-train")
OUT = H + "/results/big"
SERVICE_PT = H + "/results/finetune_docs_b4_e6_lr1e-05.pt"
STUDENT = "ViT-B-32-SigLIP2-256"
CACHE = 400
DIRS = [
    H + "/aihub-71780/photos/train",
    H + "/aihub-71780/photos/val",
    H + "/aihub-104/photos/food",
    H + "/aihub-104/photos/person",
    H + "/aihub-104/photos/indoor",
    H + "/legacy_eval",
    H + "/images",
    H + "/aihub-71553/photos",
]
tree = ast.parse(open(H + "/topics_src.py", encoding="utf-8").read())
NAMES = list(
    next(
        ast.literal_eval(n.value)
        for n in tree.body
        if isinstance(n, ast.AnnAssign) and getattr(n.target, "id", "") == "TOPICS"
    )
)
os.makedirs(OUT, exist_ok=True)
assert torch.cuda.is_available()
dev = "cuda"
torch.backends.cuda.matmul.allow_tf32 = True
torch.backends.cudnn.allow_tf32 = True
torch.set_num_threads(2)


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def rows(name):
    out = []
    for r in csv.DictReader(open(f"{H}/{name}", encoding="utf-8")):
        path = next((f"{d}/{r['file']}" for d in DIRS if os.path.exists(f"{d}/{r['file']}")), None)
        if path:
            out.append((path, NAMES.index(r["topic"])))
    return out


class Decode(Dataset):
    def __init__(self, items):
        self.items = items

    def __len__(self):
        return len(self.items)

    def __getitem__(self, i):
        im = Image.open(self.items[i][0])
        im.draft("RGB", (CACHE * 2, CACHE * 2))
        im = im.convert("RGB").resize((CACHE, CACHE), Image.BICUBIC)
        return torch.from_numpy(np.asarray(im).copy())


def cached(name):
    path = f"{OUT}/cache_{name}.pt"
    if os.path.exists(path):
        return torch.load(path)
    items = (
        rows(name + ".csv") if name != "train" else rows("gold_train.csv") + rows("gold_extra.csv")
    )
    xs = [b for b in DataLoader(Decode(items), batch_size=64, num_workers=2)]
    d = {
        "x": torch.cat(xs),
        "y": torch.tensor([i[1] for i in items]),
        "files": [i[0] for i in items],
    }
    torch.save(d, path)
    log("cached", name, tuple(d["x"].shape))
    return d


# ---------- GPU 전처리·증강 ----------
def to_float(xu8):
    return xu8.permute(0, 3, 1, 2).float().div_(255)


def norm_px(x, mean, std):
    m = torch.tensor(mean, device=x.device).view(1, 3, 1, 1)
    s = torch.tensor(std, device=x.device).view(1, 3, 1, 1)
    return (x - m) / s


def eval_view(xu8, size):
    x = F.interpolate(
        to_float(xu8), size=(size, size), mode="bicubic", antialias=True, align_corners=False
    )
    return x.clamp_(0, 1)


def aug_views(xu8, sizes, g):
    """RandomResizedCrop(0.6~1.0) + 좌우 뒤집기 + 밝기·대비·채도 0.2. 같은 자르기를 여러 크기로 낸다."""
    x = to_float(xu8)
    b = x.shape[0]
    area = torch.empty(b, device=dev).uniform_(0.6, 1.0, generator=g)
    logr = torch.empty(b, device=dev).uniform_(math.log(3 / 4), math.log(4 / 3), generator=g)
    r = logr.exp()
    w = (area * r).sqrt().clamp(max=1.0) * CACHE
    h = (area / r).sqrt().clamp(max=1.0) * CACHE
    x0 = torch.rand(b, device=dev, generator=g) * (CACHE - w)
    y0 = torch.rand(b, device=dev, generator=g) * (CACHE - h)
    boxes = torch.stack([torch.arange(b, device=dev).float(), x0, y0, x0 + w, y0 + h], 1)
    flip = torch.rand(b, device=dev, generator=g) < 0.5
    br = torch.empty(b, 1, 1, 1, device=dev).uniform_(0.8, 1.2, generator=g)
    ct = torch.empty(b, 1, 1, 1, device=dev).uniform_(0.8, 1.2, generator=g)
    sa = torch.empty(b, 1, 1, 1, device=dev).uniform_(0.8, 1.2, generator=g)
    out = []
    for s in sizes:
        v = roi_align(
            x, boxes, output_size=(s, s), spatial_scale=1.0, sampling_ratio=-1, aligned=True
        )
        v = torch.where(flip.view(b, 1, 1, 1), v.flip(-1), v)
        v = (v * br).clamp(0, 1)
        gray = (0.299 * v[:, 0] + 0.587 * v[:, 1] + 0.114 * v[:, 2]).unsqueeze(1)
        v = ((v - gray.mean((2, 3), keepdim=True)) * ct + gray.mean((2, 3), keepdim=True)).clamp(
            0, 1
        )
        gray = (0.299 * v[:, 0] + 0.587 * v[:, 1] + 0.114 * v[:, 2]).unsqueeze(1)
        out.append(((v - gray) * sa + gray).clamp(0, 1))
    return out


# ---------- 모델 ----------
class Net(nn.Module):
    def __init__(self, name):
        super().__init__()
        model, _, pre = open_clip.create_model_and_transforms(name, pretrained="webli")
        self.visual = model.visual
        self.size = pre.transforms[0].size[0]
        self.mean, self.std = pre.transforms[-1].mean, pre.transforms[-1].std
        del model
        with torch.no_grad():
            dim = self.visual(torch.zeros(1, 3, self.size, self.size)).shape[1]
        self.head = nn.Linear(dim, 4)

    def feats(self, x):
        f = self.visual(norm_px(x, self.mean, self.std))
        return f / f.norm(dim=-1, keepdim=True)

    def forward(self, x):
        return self.head(self.feats(x).float()) * 20


def set_trainable(net, blocks):
    for p in net.parameters():
        p.requires_grad = False
    trunk = net.visual.trunk
    mods = list(trunk.blocks[-blocks:]) + [trunk.norm, trunk.attn_pool]
    if blocks >= len(trunk.blocks):
        mods = [trunk]
    for m in mods:
        for p in m.parameters():
            p.requires_grad = True
    for p in net.head.parameters():
        p.requires_grad = True


@torch.no_grad()
def embed(net, xu8, bs=256):
    net.eval()
    out = []
    for i in range(0, len(xu8), bs):
        with torch.autocast("cuda", dtype=torch.bfloat16):
            out.append(net.feats(eval_view(xu8[i : i + bs].to(dev), net.size)).float())
    return torch.cat(out)


@torch.no_grad()
def logits(net, xu8, bs=256, amp=True):
    net.eval()
    out = []
    for i in range(0, len(xu8), bs):
        with torch.autocast("cuda", dtype=torch.bfloat16, enabled=amp):
            out.append(net(eval_view(xu8[i : i + bs].to(dev), net.size)).float())
    return torch.cat(out)


def class_weight(y):
    c = torch.bincount(y, minlength=4).float()
    return (c.sum() / (4 * c.clamp(min=1))).to(dev)


def fit_linear(net, x, y):
    head = nn.Linear(x.shape[1], 4).to(dev)
    opt = torch.optim.AdamW(head.parameters(), lr=1e-2, weight_decay=1e-3)
    w, y = class_weight(y), y.to(dev)
    for _ in range(300):
        opt.zero_grad()
        F.cross_entropy(head(x) * 20, y, weight=w).backward()
        opt.step()
    net.head.load_state_dict(head.state_dict())


def split(n, seed):
    idx = list(range(n))
    random.Random(7 + seed).shuffle(idx)
    cut = int(n * 0.15)
    return torch.tensor(idx[cut:]), torch.tensor(idx[:cut])


def evaluate(net, sets, amp=True):
    res = {}
    for name, d in sets.items():
        pred = logits(net, d["x"], amp=amp).argmax(1).cpu()
        res[name] = round(float((pred == d["y"]).float().mean()) * 100, 2)
        res[name + "_n"] = int((pred == d["y"]).sum())
    return res


def train(
    net,
    tr_x,
    tr_y,
    va_x,
    va_y,
    *,
    epochs,
    lr,
    seed,
    teacher=None,
    alpha=0.5,
    temp=2.0,
    extra_params=(),
    amp=True,
    fp_ref=None,
    bs=64,
    tag="",
):
    g = torch.Generator(device=dev).manual_seed(seed)
    extra_ids = {id(p) for p in extra_params}
    params = [p for p in net.visual.parameters() if p.requires_grad and id(p) not in extra_ids]
    groups = [{"params": params, "lr": lr}, {"params": list(net.head.parameters()), "lr": lr * 20}]
    if extra_params:
        groups.append({"params": list(extra_params), "lr": 1e-3, "weight_decay": 0.0})
    opt = torch.optim.AdamW(groups, weight_decay=0.05)
    bases = [gr["lr"] for gr in opt.param_groups]
    w = class_weight(tr_y)
    n = len(tr_x)
    steps_per = n // bs
    total, step, start = epochs * steps_per, 0, time.time()
    best = (-1.0, 0, None)
    sizes = (
        [net.size]
        + ([teacher.size] if teacher is not None else [])
        + ([fp_ref.size] if fp_ref is not None else [])
    )
    for ep in range(epochs):
        net.train()
        perm = torch.randperm(n, generator=torch.Generator().manual_seed(seed * 100 + ep))
        for k in range(steps_per):
            idx = perm[k * bs : (k + 1) * bs].to(dev)
            xb = tr_x[idx].to(dev, non_blocking=True)
            yb = tr_y.to(dev)[idx]
            views = aug_views(xb, sizes, g)
            for gr, base in zip(opt.param_groups, bases):
                gr["lr"] = base * 0.5 * (1 + math.cos(math.pi * step / total))
            with torch.autocast("cuda", dtype=torch.bfloat16, enabled=amp):
                ls = net(views[0])
                loss = F.cross_entropy(ls, yb, weight=w)
                if teacher is not None:
                    with torch.no_grad():
                        lt = teacher(views[1]).float()
                    kd = (
                        F.kl_div(
                            F.log_softmax(ls.float() / temp, 1),
                            F.softmax(lt / temp, 1),
                            reduction="batchmean",
                        )
                        * temp
                        * temp
                    )
                    loss = (1 - alpha) * loss + alpha * kd
                if fp_ref is not None:
                    with torch.no_grad():
                        fr = fp_ref.feats(views[-1]).float()
                        lr_ = fp_ref.head(fr) * 20
                    fs = net.feats(views[0]).float()
                    loss = (
                        loss
                        + (1 - (fs * fr).sum(1)).mean() * 10
                        + F.kl_div(
                            F.log_softmax(ls.float() / temp, 1),
                            F.softmax(lr_ / temp, 1),
                            reduction="batchmean",
                        )
                        * temp
                        * temp
                    )
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            step += 1
        pv = logits(net, va_x, amp=amp).argmax(1).cpu()
        acc = float((pv == va_y).float().mean())
        log(
            tag,
            "epoch",
            ep + 1,
            "val",
            round(acc * 100, 2),
            "loss",
            round(float(loss), 4),
            "sec",
            round(time.time() - start),
        )
        if acc > best[0]:
            best = (acc, ep + 1, {k: v.detach().clone() for k, v in net.state_dict().items()})
    net.load_state_dict(best[2])
    return {
        "best_epoch": best[1],
        "val": round(best[0] * 100, 2),
        "train_sec": round(time.time() - start),
    }


def data():
    tr = cached("train")
    sets = {"eval1931": cached("gold_eval"), "legacy": cached("gold_legacy")}
    for d in [tr, *sets.values()]:
        d["x"] = d["x"].to(dev)
    return tr, sets


def save_net(net, path, extra=None):
    trainable = {k: v.detach().cpu() for k, v in net.state_dict().items()}
    torch.save({"state": trainable, **(extra or {})}, path)


def tag_of(name):
    return name.replace("ViT-", "").replace("-SigLIP2", "")


# ---------- 단계 ----------
def run_teacher(name, blocks, seed=1):
    tr, sets = data()
    net = Net(name).to(dev)
    set_trainable(net, blocks)
    tri, vai = split(len(tr["x"]), seed)
    fit_linear(net, embed(net, tr["x"][tri]), tr["y"][tri])
    info = train(
        net,
        tr["x"][tri],
        tr["y"][tri],
        tr["x"][vai],
        tr["y"][vai],
        epochs=6,
        lr=1e-5,
        seed=seed,
        tag=f"teacher {tag_of(name)}",
    )
    res = {"model": name, "blocks": blocks, **info, **evaluate(net, sets)}
    save_net(net, f"{OUT}/teacher_{tag_of(name)}.pt", {"model": name})
    json.dump(res, open(f"{OUT}/teacher_{tag_of(name)}.json", "w"), indent=1)
    log("RESULT", json.dumps(res))


def load_teacher(name):
    net = Net(name).to(dev)
    net.load_state_dict(torch.load(f"{OUT}/teacher_{tag_of(name)}.pt")["state"])
    for p in net.parameters():
        p.requires_grad = False
    return net.eval()


def run_kd(tname, seed, blocks, alpha=0.5):
    tr, sets = data()
    teacher = load_teacher(tname)
    net = Net(STUDENT).to(dev)
    set_trainable(net, blocks)
    tri, vai = split(len(tr["x"]), seed)
    fit_linear(net, embed(net, tr["x"][tri]), tr["y"][tri])
    tag = f"kd_{tag_of(tname)}_s{seed}_b{blocks}_a{alpha}"
    info = train(
        net,
        tr["x"][tri],
        tr["y"][tri],
        tr["x"][vai],
        tr["y"][vai],
        epochs=6,
        lr=1e-5,
        seed=seed,
        teacher=teacher,
        alpha=alpha,
        tag=tag,
    )
    res = {
        "teacher": tname,
        "seed": seed,
        "blocks": blocks,
        "alpha": alpha,
        **info,
        **evaluate(net, sets),
    }
    save_net(net, f"{OUT}/{tag}.pt")
    json.dump(res, open(f"{OUT}/{tag}.json", "w"), indent=1)
    log("RESULT", json.dumps(res))


def run_base(seed, blocks):
    """증류 없는 같은 레시피(비교 기준). photo_exp.py seed와 같지만 GPU 증강."""
    tr, sets = data()
    net = Net(STUDENT).to(dev)
    set_trainable(net, blocks)
    tri, vai = split(len(tr["x"]), seed)
    fit_linear(net, embed(net, tr["x"][tri]), tr["y"][tri])
    tag = f"base_s{seed}_b{blocks}"
    info = train(
        net,
        tr["x"][tri],
        tr["y"][tri],
        tr["x"][vai],
        tr["y"][vai],
        epochs=6,
        lr=1e-5,
        seed=seed,
        tag=tag,
    )
    res = {"seed": seed, "blocks": blocks, **info, **evaluate(net, sets)}
    save_net(net, f"{OUT}/{tag}.pt")
    json.dump(res, open(f"{OUT}/{tag}.json", "w"), indent=1)
    log("RESULT", json.dumps(res))


# ---------- QAT: ONNX Runtime 정적 int8(QDQ)과 같은 모양 ----------
class QLinear(nn.Module):
    """가중치: 출력 채널별 대칭 int8. 입력: 텐서 하나에 비대칭 uint8, 범위(scale, zero point)를 학습."""

    def __init__(self, lin):
        super().__init__()
        self.lin = lin
        self.scale = nn.Parameter(torch.ones(1))
        self.zp = nn.Parameter(torch.zeros(1))
        self.observe = None  # 보정 중이면 리스트

    def forward(self, x):
        if self.observe is not None:
            flat = x.detach().float().flatten()
            sample = flat[
                torch.randint(0, flat.numel(), (min(flat.numel(), 2_000_000),), device=flat.device)
            ]
            self.observe.append(
                (float(flat.min()), float(flat.max()), float(torch.quantile(sample, 0.9999)))
            )
            return self.lin(x)
        w = self.lin.weight.float()
        sw = (w.detach().abs().amax(1) / 127).clamp(min=1e-8)
        wq = torch.fake_quantize_per_channel_affine(
            w, sw, torch.zeros_like(sw, dtype=torch.int32), 0, -127, 127
        )
        xq = torch._fake_quantize_learnable_per_tensor_affine(
            x.float(), self.scale, self.zp, 0, 255, 1.0
        )
        b = self.lin.bias.float() if self.lin.bias is not None else None
        return F.linear(xq, wq, b)


def wrap_qat(net):
    qs = {}
    trunk = net.visual.trunk
    for root in ("blocks", "attn_pool"):
        for name, mod in list(getattr(trunk, root).named_modules()):
            for cname, child in list(mod.named_children()):
                if isinstance(child, nn.Linear):
                    q = QLinear(child).to(child.weight.device)
                    setattr(mod, cname, q)
                    full = f"trunk.{root}.{name}.{cname}".replace("..", ".")
                    qs[full] = q
    return qs


@torch.no_grad()
def calibrate(net, qs, xu8, mode):
    for q in qs.values():
        q.observe = []
    net.eval()
    for i in range(0, len(xu8), 32):
        net(eval_view(xu8[i : i + 32].to(dev), net.size))
    for q in qs.values():
        lo = min(o[0] for o in q.observe)
        hi = max(o[1] for o in q.observe) if mode == "minmax" else max(o[2] for o in q.observe)
        lo, hi = min(lo, 0.0), max(hi, 1e-3)
        s = (hi - lo) / 255
        q.scale.data.fill_(s)
        q.zp.data.fill_(round(-lo / s))
        q.observe = None


def run_qat(init, seed, epochs=3, lr=3e-6, mode="pct"):
    tr, sets = data()
    net = Net(STUDENT).to(dev)
    if init == "service":
        st = torch.load(SERVICE_PT, map_location=dev)
        net.visual.load_state_dict(st["visual"])
        net.head.load_state_dict(st["head"])
    else:
        net.load_state_dict(torch.load(f"{OUT}/{init}.pt")["state"])
    fp_ref = Net(STUDENT).to(dev)
    fp_ref.load_state_dict(net.state_dict())
    for p in fp_ref.parameters():
        p.requires_grad = False
    fp_ref.eval()
    fp_res = evaluate(fp_ref, sets, amp=False)
    qs = wrap_qat(net)
    tri, vai = split(len(tr["x"]), seed)
    calibrate(net, qs, tr["x"][tri][::20], mode)
    ptq = evaluate(net, sets, amp=False)  # 학습 전 int8 흉내 (= 단순 PTQ에 가까움)
    log("fp32", fp_res, "ptq_sim", ptq, "quant layers", len(qs))
    set_trainable(net, 99)
    qparams = [p for q in qs.values() for p in (q.scale, q.zp)]
    for p in qparams:
        p.requires_grad = True
    tag = f"qat_{init}_s{seed}_{mode}"
    info = train(
        net,
        tr["x"][tri],
        tr["y"][tri],
        tr["x"][vai],
        tr["y"][vai],
        epochs=epochs,
        lr=lr,
        seed=seed,
        extra_params=qparams,
        amp=False,
        fp_ref=fp_ref,
        tag=tag,
    )
    res = {
        "init": init,
        "seed": seed,
        "mode": mode,
        "fp32": fp_res,
        "ptq_sim": ptq,
        **info,
        "qat_sim": evaluate(net, sets, amp=False),
    }
    # 내보내기: 원래 Linear 이름으로 가중치, 입력 범위는 따로
    state = {}
    for k, v in net.visual.state_dict().items():
        if k.endswith(".scale") or k.endswith(".zp"):
            continue
        state[k.replace(".lin.", ".")] = v.detach().half().cpu()
    ranges = {
        name: {"scale": float(q.scale), "zero_point": int(round(float(q.zp.clamp(0, 255))))}
        for name, q in qs.items()
    }
    torch.save(
        {
            "visual": state,
            "head": {k: v.cpu() for k, v in net.head.state_dict().items()},
            "ranges": ranges,
        },
        f"{OUT}/{tag}.pt",
    )
    json.dump(res, open(f"{OUT}/{tag}.json", "w"), indent=1)
    log("RESULT", json.dumps(res))


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "cache":
        data()
    elif cmd == "teacher":
        run_teacher(sys.argv[2], int(sys.argv[3]))
    elif cmd == "kd":
        run_kd(
            sys.argv[2],
            int(sys.argv[3]),
            int(sys.argv[4]),
            float(sys.argv[5]) if len(sys.argv) > 5 else 0.5,
        )
    elif cmd == "base":
        run_base(int(sys.argv[2]), int(sys.argv[3]))
    elif cmd == "qat":
        run_qat(sys.argv[2], int(sys.argv[3]), mode=sys.argv[4] if len(sys.argv) > 4 else "pct")
