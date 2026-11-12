"""3차: 정답 없는 사진 활용(선생 라벨), 사진 묶기에 강한 인코더, CPU용 작은 CNN 학생, 묶기 벤치마크.

  big3.py pseudo                       71780 train 중 안 쓴 사진에 선생 앙상블 라벨
  big3.py gbench_build                 묶기 벤치마크 사진(연속 촬영 흉내) 만들기 (CPU 1회)
  big3.py gbench src=<tag|service>     묶기 벤치마크 평가
  big3.py semi seed= blocks= tag= [teacher=so400m_b12e10] [conf=0.9]
  big3.py contrast seed= blocks= lam= tag= [semi=1]
  big3.py cnn arch= epochs= tag= [semi=1] [lr=]
결과: ~/photo-train/results/big/<tag>.json
"""

import csv
import io
import json
import math
import os
import random
import sys

import big
import big2
import numpy as np
import torch
import torch.nn.functional as F
from big import (
    CACHE,
    OUT,
    STUDENT,
    H,
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
from PIL import Image, ImageEnhance
from torch import nn
from torch.utils.data import DataLoader, Dataset

UNL_DIR = H + "/aihub-71780/photos/train"
TEACH = "so400m_b12e10"


def used_files():
    s = set()
    for name in ("gold_train.csv", "gold_extra.csv", "gold_eval.csv", "gold_legacy.csv"):
        for r in csv.DictReader(open(f"{H}/{name}", encoding="utf-8")):
            s.add(r["file"])
    if os.path.exists(H + "/exclude.txt"):
        s |= {
            ln.strip().split("/")[-1]
            for ln in open(H + "/exclude.txt", encoding="utf-8")
            if ln.strip()
        }
    return s


class Files(Dataset):
    def __init__(self, paths):
        self.paths = paths

    def __len__(self):
        return len(self.paths)

    def __getitem__(self, i):
        try:
            im = Image.open(self.paths[i])
            im.draft("RGB", (CACHE * 2, CACHE * 2))
            im = im.convert("RGB").resize((CACHE, CACHE), Image.BICUBIC)
            return torch.from_numpy(np.asarray(im).copy()), True
        except Exception:  # noqa: BLE001
            return torch.zeros(CACHE, CACHE, 3, dtype=torch.uint8), False


def job_pseudo(teachers_="so400m_b12e10,so400m_full,so400m"):
    path = f"{OUT}/cache_unl.pt"
    if os.path.exists(path):
        log("SKIP pseudo")
        return
    used = used_files()
    files = sorted(
        f
        for f in os.listdir(UNL_DIR)
        if f.lower().endswith((".jpg", ".jpeg", ".png")) and f not in used
    )
    log("unlabeled", len(files))
    xs, ok = [], []
    for x, k in DataLoader(Files([f"{UNL_DIR}/{f}" for f in files]), batch_size=64, num_workers=2):
        xs.append(x)
        ok.append(k)
    x, ok = torch.cat(xs), torch.cat(ok)
    x, files = x[ok], [f for f, k in zip(files, ok.tolist()) if k]
    ens = big2.teachers(teachers_)
    p = F.softmax(big.logits(ens, x.to(dev), bs=128), 1).cpu()
    conf, y = p.max(1)
    torch.save({"x": x, "y": y, "conf": conf, "p": p, "files": files}, path)
    res = {
        "n": len(files),
        "conf>=0.9": int((conf >= 0.9).sum()),
        "by_topic": {big.NAMES[i]: int(((y == i) & (conf >= 0.9)).sum()) for i in range(4)},
    }
    json.dump(res, open(f"{OUT}/pseudo.json", "w"), indent=1)
    log("RESULT pseudo", res)


def semi_data(seed, conf):
    tr, sets = big.data()
    tri, vai = split(len(tr["x"]), seed)
    x, y = tr["x"][tri], tr["y"][tri]
    for _ in range(240):
        if os.path.exists(f"{OUT}/pseudo.json"):
            break
        import time

        time.sleep(30)
    u = torch.load(f"{OUT}/cache_unl.pt")
    keep = u["conf"] >= conf
    x = torch.cat([x, u["x"][keep].to(dev)])
    y = torch.cat([y, u["y"][keep]])
    log("semi train", len(x), "pseudo", int(keep.sum()))
    return x, y, tr["x"][vai], tr["y"][vai], sets


def job_semi(seed=1, blocks=8, tag=None, teacher=TEACH, conf=0.9, temp=2.0):
    seed = int(seed)
    x, y, vx, vy, sets = semi_data(seed, float(conf))
    t = big2.teachers(teacher)
    net = Net(STUDENT).to(dev)
    set_trainable(net, int(blocks))
    fit_linear(net, embed(net, x), y)
    info = train(
        net,
        x,
        y,
        vx,
        vy,
        epochs=6,
        lr=1e-5,
        seed=seed,
        teacher=t,
        alpha=0.5,
        temp=float(temp),
        tag=tag,
    )
    big2.finish(
        tag,
        {
            "kind": "semi",
            "teachers": teacher,
            "seed": seed,
            "blocks": int(blocks),
            "conf": float(conf),
            "n_train": len(x),
            **info,
            **evaluate(net, sets),
        },
        net,
    )


# ---------- 묶기에 강한 인코더 (대조 학습) ----------
def burst_gpu(xu8, size, g):
    """연속 촬영처럼: 85~100% 자르기, 밝기 ±10%. 원본과 짝."""
    x = big.to_float(xu8)
    b = x.shape[0]
    s = torch.empty(b, device=dev).uniform_(0.85, 1.0, generator=g) * CACHE
    x0 = torch.rand(b, device=dev, generator=g) * (CACHE - s)
    y0 = torch.rand(b, device=dev, generator=g) * (CACHE - s)
    boxes = torch.stack([torch.arange(b, device=dev).float(), x0, y0, x0 + s, y0 + s], 1)
    from torchvision.ops import roi_align

    v = roi_align(
        x, boxes, output_size=(size, size), spatial_scale=1.0, sampling_ratio=-1, aligned=True
    )
    br = torch.empty(b, 1, 1, 1, device=dev).uniform_(0.9, 1.1, generator=g)
    return (v * br).clamp(0, 1)


def train_contrast(net, x, y, vx, vy, *, seed, teacher, lam, epochs=6, lr=1e-5, bs=128, tag=""):
    g = torch.Generator(device=dev).manual_seed(seed)
    params = [p for p in net.visual.parameters() if p.requires_grad]
    opt = torch.optim.AdamW(
        [{"params": params, "lr": lr}, {"params": list(net.head.parameters()), "lr": lr * 20}],
        weight_decay=0.05,
    )
    bases = [gr["lr"] for gr in opt.param_groups]
    w = big.class_weight(y)
    n, steps_per = len(x), len(x) // bs
    total, step, best = epochs * steps_per, 0, (-1e9, 0, None)
    for ep in range(epochs):
        net.train()
        perm = torch.randperm(n, generator=torch.Generator().manual_seed(seed * 100 + ep))
        for k in range(steps_per):
            idx = perm[k * bs : (k + 1) * bs].to(dev)
            xb, yb = x[idx], y.to(dev)[idx]
            v1, vt = big.aug_views(xb, [net.size, teacher.size], g)
            b1 = burst_gpu(xb, net.size, g)
            b2 = burst_gpu(xb, net.size, g)
            for gr, base in zip(opt.param_groups, bases):
                gr["lr"] = base * 0.5 * (1 + math.cos(math.pi * step / total))
            with torch.autocast("cuda", dtype=torch.bfloat16):
                ls = net(v1)
                with torch.no_grad():
                    lt = teacher(vt).float()
                loss = 0.5 * F.cross_entropy(ls, yb, weight=w) + 0.5 * 4 * F.kl_div(
                    F.log_softmax(ls.float() / 2, 1), F.softmax(lt / 2, 1), reduction="batchmean"
                )
                f1, f2 = net.feats(b1).float(), net.feats(b2).float()
                sim = f1 @ f2.T / 0.05
                lab = torch.arange(len(f1), device=dev)
                loss = loss + lam * 0.5 * (F.cross_entropy(sim, lab) + F.cross_entropy(sim.T, lab))
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            step += 1
        pv = big.logits(net, vx).argmax(1).cpu()
        acc = float((pv == vy).float().mean())
        gb = gbench_score(net, quick=True)
        score = acc * 100 + gb["recall_mild@fmr1e-5"] / 10  # 분류를 먼저, 묶기는 보조
        log(
            tag,
            "epoch",
            ep + 1,
            "val",
            round(acc * 100, 2),
            "gb",
            gb,
            "loss",
            round(float(loss), 4),
        )
        if score > best[0]:
            best = (
                score,
                ep + 1,
                {k: v.detach().clone() for k, v in net.state_dict().items()},
                acc,
            )
    net.load_state_dict(best[2])
    return {"best_epoch": best[1], "val": round(best[3] * 100, 2)}


def job_contrast(seed=1, blocks=8, lam=0.5, tag=None, semi=0):
    seed = int(seed)
    if int(semi):
        x, y, vx, vy, sets = semi_data(seed, 0.9)
    else:
        tr, sets = big.data()
        tri, vai = split(len(tr["x"]), seed)
        x, y, vx, vy = tr["x"][tri], tr["y"][tri], tr["x"][vai], tr["y"][vai]
    t = big2.teachers(TEACH)
    net = Net(STUDENT).to(dev)
    set_trainable(net, int(blocks))
    fit_linear(net, embed(net, x), y)
    info = train_contrast(net, x, y, vx, vy, seed=seed, teacher=t, lam=float(lam), tag=tag)
    big2.finish(
        tag,
        {
            "kind": "contrast",
            "seed": seed,
            "blocks": int(blocks),
            "lam": float(lam),
            "semi": int(semi),
            **info,
            **evaluate(net, sets),
            "gbench": gbench_score(net),
        },
        net,
    )


# ---------- 작은 CNN 학생 ----------
class CNNNet(nn.Module):
    def __init__(self, arch, emb_dim):
        super().__init__()
        import timm

        body = timm.create_model(arch, pretrained=True, num_classes=0)
        cfg = body.pretrained_cfg
        self.size = 256
        self.mean, self.std = cfg["mean"], cfg["std"]
        with torch.no_grad():
            body.eval()
            nf = body(torch.zeros(2, 3, 256, 256)).shape[
                1
            ]  # mnv4는 num_features와 출력 폭이 다르다
            body.train()
        self.visual = nn.ModuleDict({"body": body, "proj": nn.Linear(nf, emb_dim)})
        self.head = nn.Linear(emb_dim, 4)

    def feats(self, x):
        f = self.visual["proj"](self.visual["body"](big.norm_px(x, self.mean, self.std)))
        return f / f.norm(dim=-1, keepdim=True)

    def forward(self, x):
        return self.head(self.feats(x).float()) * 20


def job_cnn(arch, epochs=20, lr=3e-4, tag=None, semi=0, seed=1):
    seed = int(seed)
    if int(semi):
        x, y, vx, vy, sets = semi_data(seed, 0.9)
    else:
        tr, sets = big.data()
        tri, vai = split(len(tr["x"]), seed)
        x, y, vx, vy = tr["x"][tri], tr["y"][tri], tr["x"][vai], tr["y"][vai]
    t = big2.teachers(TEACH)
    dim = t.head.in_features
    net = CNNNet(arch, dim).to(dev)
    nparam = sum(p.numel() for p in net.parameters())
    # 선생 임베딩·확률을 따라 배운다(fp_ref 경로: 코사인 + KL) + 정답 CE
    info = train(net, x, y, vx, vy, epochs=int(epochs), lr=float(lr), seed=seed, fp_ref=t, tag=tag)
    big2.finish(
        tag,
        {
            "kind": "cnn",
            "arch": arch,
            "params_m": round(nparam / 1e6, 2),
            "semi": int(semi),
            **info,
            **evaluate(net, sets),
            "gbench": gbench_score(net),
        },
        net,
        {"arch": arch, "emb_dim": dim},
    )


# ---------- 묶기 벤치마크 ----------
GB = f"{OUT}/gbench.pt"


def job_gbench_build():
    if os.path.exists(GB):
        return
    rng = random.Random(0)
    files = big.cached("gold_eval")["files"]

    def thumb(p):
        im = Image.open(p).convert("RGB")
        im.thumbnail((448, 448))
        return im

    def burst(img, strength):
        w, h = img.size
        crop = 1 - strength * rng.uniform(0.05, 0.15)
        cw, ch = int(w * crop), int(h * crop)
        x, y = rng.randint(0, w - cw), rng.randint(0, h - ch)
        out = img.crop((x, y, x + cw, y + ch)).resize((w, h))
        out = out.rotate(rng.uniform(-3, 3) * strength, resample=Image.BICUBIC)
        out = ImageEnhance.Brightness(out).enhance(1 + rng.uniform(-0.15, 0.15) * strength)
        buf = io.BytesIO()
        out.save(buf, "JPEG", quality=rng.randint(70, 90))
        return Image.open(io.BytesIO(buf.getvalue())).convert("RGB")

    def u8(im):
        return torch.from_numpy(np.asarray(im.resize((CACHE, CACHE), Image.BICUBIC)).copy())

    base, aug = [], {s: [] for s in ("0.5", "1.0", "2.0")}
    for p in files:
        t = thumb(p)
        base.append(u8(t))
        for s in aug:
            aug[s].append(u8(burst(t, float(s))))
    torch.save({"base": torch.stack(base), **{k: torch.stack(v) for k, v in aug.items()}}, GB)
    log("RESULT gbench_build", len(base))


_gb = None


@torch.no_grad()
def gbench_score(net, quick=False):
    global _gb
    for _ in range(240):
        if os.path.exists(GB):
            break
        import time

        time.sleep(30)
    if _gb is None:
        _gb = {k: v.to(dev) for k, v in torch.load(GB).items()}
    n = 600 if quick else len(_gb["base"])
    base = embed(net, _gb["base"][:n])
    sims = base @ base.T
    iu = torch.triu_indices(n, n, 1, device=dev)
    neg = sims[iu[0], iu[1]]
    res = {}
    for fmr, name in ((1e-5, "1e-5"), (1e-4, "1e-4")):
        k = max(1, int(len(neg) * fmr))
        thr = float(torch.topk(neg, k).values[-1])
        for s, lab in (("0.5", "mild"), ("1.0", "mid"), ("2.0", "strong")):
            if quick and s != "0.5":
                continue
            pos = (base * embed(net, _gb[s][:n])).sum(1)
            res[f"recall_{lab}@fmr{name}"] = round(float((pos > thr).float().mean()) * 100, 2)
        res[f"thr@fmr{name}"] = round(thr, 4)
    if not quick:
        pos = (base * embed(net, _gb["0.5"])).sum(1)
        res["at0.94"] = {
            "recall_mild": round(float((pos >= 0.94).float().mean()) * 100, 2),
            "false_pairs": int((neg >= 0.94).sum()),
        }
    return res


def job_gbench(src):
    tag = f"gbench_{src}"
    if src == "service":
        net = Net(STUDENT).to(dev)
        st = torch.load(big.SERVICE_PT, map_location=dev)
        net.visual.load_state_dict(st["visual"])
        net.head.load_state_dict(st["head"])
    elif src.startswith("teacher_"):
        net = big2.load_teacher(src[len("teacher_") :])
    else:
        net = Net(STUDENT).to(dev)
        net.load_state_dict(torch.load(f"{OUT}/{src}.pt", map_location=dev)["state"])
    big2.finish(tag, {"src": src, **gbench_score(net)})


if __name__ == "__main__":
    kind = sys.argv[1]
    kw = dict(a.split("=", 1) for a in sys.argv[2:])
    if kw.get("tag") and big2.done(kw["tag"]):
        log("SKIP", kw["tag"])
        sys.exit(0)
    {
        "pseudo": job_pseudo,
        "gbench_build": job_gbench_build,
        "gbench": job_gbench,
        "semi": job_semi,
        "contrast": job_contrast,
        "cnn": job_cnn,
    }[kind](**kw)
