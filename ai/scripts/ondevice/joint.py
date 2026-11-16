"""폰용 사진 인코더 하나로 주제 분류 + 한국어 문장 검색 (+ 비슷한 사진 묶기).

B-32 SigLIP2의 사진 인코더 뒤쪽 블록·문장 인코더 뒤쪽 블록·분류기를 함께 학습한다.
  손실 = 분류 CE (+ 선생 KD) + lam * 시그모이드 대조 손실(사진-GMS 캡션)
에폭은 학습 쪽에서 떼어 둔 검증(분류 15%, 캡션 10%)으로 고른다. 평가 세트는 고르는 데 쓰지 않는다.

  joint.py vb=8 tb=4 lam=1.0 kd=0 epochs=6 lr=1e-5 tlr=3e-5 seed=1 tag=
결과: ~/photo-train/results/big/joint_<tag>.{json,pt}
"""

import json
import math
import os
import random
import sys
import tarfile
import time

import numpy as np
import open_clip
import torch
import torch.nn.functional as F
from PIL import Image
from torch import nn

sys.path.insert(0, os.path.expanduser("~/photo-train"))
import big  # noqa: E402
from big import CACHE, OUT, dev, log  # noqa: E402

MODEL = "ViT-B-32-SigLIP2-256"
CAP_EVAL = OUT + "/cap_eval.json"
CAP_TRAIN = OUT + "/cap_train.json"


class Joint(nn.Module):
    def __init__(self):
        super().__init__()
        m, _, pre = open_clip.create_model_and_transforms(MODEL, pretrained="webli")
        self.clip = m
        self.tok = open_clip.get_tokenizer(MODEL)
        self.size = pre.transforms[0].size[0]
        self.mean, self.std = pre.transforms[-1].mean, pre.transforms[-1].std
        self.head = nn.Linear(768, 4)

    @property
    def visual(self):
        return self.clip.visual

    def img(self, x):
        f = self.clip.encode_image(big.norm_px(x, self.mean, self.std))
        return F.normalize(f.float(), dim=-1)

    def txt(self, texts):
        f = self.clip.encode_text(self.tok(texts).to(dev))
        return F.normalize(f.float(), dim=-1)

    def cls(self, f):
        return self.head(f) * 20


def set_trainable(net, vb, tb):
    for p in net.parameters():
        p.requires_grad = False
    trunk = net.visual.trunk
    vis = list(trunk.blocks[-vb:]) + [trunk.norm, trunk.attn_pool]
    tt = net.clip.text
    txt = (
        list(tt.transformer.resblocks[-tb:])
        if hasattr(tt, "transformer")
        else list(tt.trunk.blocks[-tb:])
    )
    for name in ("ln_final", "text_projection", "pooler", "head", "norm"):
        if hasattr(tt, name) and isinstance(getattr(tt, name), nn.Module):
            txt.append(getattr(tt, name))
    if hasattr(tt, "trunk"):
        for name in ("norm", "attn_pool", "head"):
            if hasattr(tt.trunk, name) and isinstance(getattr(tt.trunk, name), nn.Module):
                txt.append(getattr(tt.trunk, name))
    for mod in vis + txt + [net.head]:
        for p in mod.parameters():
            p.requires_grad = True
    for name in ("logit_scale", "logit_bias"):
        if hasattr(net.clip, name):
            getattr(net.clip, name).requires_grad = True
    vp = [p for m in vis for p in m.parameters()]
    tp = [p for m in txt for p in m.parameters()]
    return vp, tp


@torch.no_grad()
def img_emb(net, xu8, bs=256):
    out = []
    for i in range(0, len(xu8), bs):
        with torch.autocast("cuda", dtype=torch.bfloat16):
            out.append(net.img(big.eval_view(xu8[i : i + bs].to(dev), net.size)))
    return torch.cat(out).float()


@torch.no_grad()
def txt_emb(net, texts, bs=256):
    out = []
    for i in range(0, len(texts), bs):
        with torch.autocast("cuda", dtype=torch.bfloat16):
            out.append(net.txt(texts[i : i + bs]))
    return torch.cat(out).float()


def ranks(ti, ii):
    sims = ti @ ii.T
    return (sims > sims.diag().unsqueeze(1)).sum(1).cpu().numpy() + 1


def rmetrics(r):
    return {
        "R@1": round(float((r <= 1).mean()) * 100, 2),
        "R@5": round(float((r <= 5).mean()) * 100, 2),
        "R@10": round(float((r <= 10).mean()) * 100, 2),
    }


def search_eval(net, x, q, c):
    net.eval()
    ii = img_emb(net, x)
    return {
        "query": rmetrics(ranks(txt_emb(net, q), ii)),
        "caption": rmetrics(ranks(txt_emb(net, c), ii)),
    }


def cls_eval(net, sets):
    net.eval()
    res = {}
    for name, d in sets.items():
        with torch.no_grad():
            pred = net.cls(img_emb(net, d["x"])).argmax(1).cpu()
        res[name] = round(float((pred == d["y"]).float().mean()) * 100, 2)
        res[name + "_n"] = int((pred == d["y"]).sum())
    return res


def cap_train():
    path = OUT + "/cache_cap_train.pt"
    if os.path.exists(path):
        return torch.load(path)
    caps = json.load(open(CAP_TRAIN, encoding="utf-8"))
    xs, texts = [], []
    with tarfile.open(OUT + "/cap_train.tar") as t:
        for m in t.getmembers():
            if m.name not in caps:
                continue
            im = Image.open(t.extractfile(m)).convert("RGB").resize((CACHE, CACHE), Image.BICUBIC)
            xs.append(torch.from_numpy(np.asarray(im).copy()))
            texts.append((caps[m.name]["query"], caps[m.name]["caption"]))
    d = {"x": torch.stack(xs), "texts": texts}
    torch.save(d, path)
    return d


def cap_eval():
    d = big.cached("gold_eval")
    caps = json.load(open(CAP_EVAL, encoding="utf-8"))
    keep = [i for i, f in enumerate(d["files"]) if os.path.basename(f) in caps]
    files = [os.path.basename(d["files"][i]) for i in keep]
    return d["x"][keep], [caps[f]["query"] for f in files], [caps[f]["caption"] for f in files]


@torch.no_grad()
def search_teacher(name, model_name, cx, ctexts):
    """큰 검색 모델(ts_<name>.pt)로 캡션 학습 사진·문장 벡터를 미리 뽑는다. 학습 중에는 이 벡터 사이 유사도를 따라 하게 한다."""
    m, _, pre = open_clip.create_model_and_transforms(model_name, pretrained="webli")
    if name != "pretrained":  # pretrained: 파인튜닝 안 한 원래 큰 모델
        m.load_state_dict(
            torch.load(f"{OUT}/ts_{name}.pt", map_location="cpu")["state"], strict=False
        )
    m = m.to(dev).eval()
    tok = open_clip.get_tokenizer(model_name)
    size, mean, std = pre.transforms[0].size[0], pre.transforms[-1].mean, pre.transforms[-1].std
    ii, tq, tc = [], [], []
    for i in range(0, len(cx), 128):
        with torch.autocast("cuda", dtype=torch.bfloat16):
            ii.append(
                F.normalize(
                    m.encode_image(
                        big.norm_px(big.eval_view(cx[i : i + 128], size), mean, std)
                    ).float(),
                    dim=-1,
                )
            )
    for i in range(0, len(ctexts), 256):
        part = ctexts[i : i + 256]
        with torch.autocast("cuda", dtype=torch.bfloat16):
            tq.append(F.normalize(m.encode_text(tok([t[0] for t in part]).to(dev)).float(), dim=-1))
            tc.append(F.normalize(m.encode_text(tok([t[1] for t in part]).to(dev)).float(), dim=-1))
    del m
    torch.cuda.empty_cache()
    return torch.cat(ii), torch.stack([torch.cat(tq), torch.cat(tc)], 1)


def run(
    vb=8,
    tb=4,
    lam=1.0,
    kd=0,
    epochs=6,
    lr=1e-5,
    tlr=3e-5,
    seed=1,
    cbs=64,
    sbs=256,
    alpha=0.5,
    temp=2.0,
    unl=0.0,
    tkd=0.0,
    tkd_t="ft_so400m_blocks4tblocks4lr1e-5",
    tkd_model="ViT-SO400M-16-SigLIP2-384",
    tkd_tau=0.05,
    tag="",
):
    vb, tb, epochs, seed, cbs, sbs = int(vb), int(tb), int(epochs), int(seed), int(cbs), int(sbs)
    lam, lr, tlr, alpha, temp, unl = (
        float(lam),
        float(lr),
        float(tlr),
        float(alpha),
        float(temp),
        float(unl),
    )
    tkd, tkd_tau = float(tkd), float(tkd_tau)
    torch.manual_seed(seed)
    t0 = time.time()
    tr, sets = big.data()
    cap = cap_train()
    cx = cap["x"].to(dev)
    ctexts = cap["texts"]
    order = list(range(len(ctexts)))
    random.Random(11 + seed).shuffle(order)
    ncv = len(order) // 10
    cva, ctr = torch.tensor(order[:ncv]), torch.tensor(order[ncv:])
    ex, eq, ec = cap_eval()
    tri, vai = big.split(len(tr["x"]), seed)
    if unl > 0:
        # 라벨 없는 사진: 선생 앙상블이 unl 이상 확신한 것만 학습 쪽에 붙인다 (검증·평가에는 안 넣음)
        u = torch.load(f"{OUT}/cache_unl.pt")
        keep = u["conf"] >= unl
        n0 = len(tr["x"])
        tr = {
            **tr,
            "x": torch.cat([tr["x"], u["x"][keep].to(tr["x"].device)]),
            "y": torch.cat([tr["y"], u["y"][keep].to(tr["y"].device)]),
        }
        tri = torch.cat([tri, torch.arange(n0, len(tr["x"]))])
        log(tag, "pseudo added", int(keep.sum()))
        del u
    t_data = time.time() - t0
    t_tkd = 0.0
    if tkd > 0:
        a = time.time()
        t_img, t_txt = search_teacher(tkd_t, tkd_model, cx, ctexts)
        t_tkd = time.time() - a
        log(tag, "search teacher", tkd_t, "sec", round(t_tkd))

    net = Joint().to(dev)
    vp, tp = set_trainable(net, vb, tb)
    # 분류기 초기값: 기본 벡터에 선형 분류기
    big.fit_linear(net, img_emb(net, tr["x"][tri]), tr["y"][tri])
    teacher = None
    if int(kd):
        st = torch.load(f"{OUT}/teacher_so400m_b12e10.pt", map_location="cpu")
        name = st.get("model") or json.load(open(f"{OUT}/teacher_so400m_b12e10.json"))["model"]
        teacher = big.Net(name).to(dev)
        teacher.load_state_dict(st["state"])
        for p in teacher.parameters():
            p.requires_grad = False
        teacher.eval()

    t1 = time.time()
    before = {"cls": cls_eval(net, sets), "search": search_eval(net, ex, eq, ec)}
    log(tag, "before", before)
    t_eval0 = time.time() - t1
    t_setup = t1 - t0 - t_data
    extra = [getattr(net.clip, n) for n in ("logit_scale", "logit_bias") if hasattr(net.clip, n)]
    groups = [
        {"params": vp, "lr": lr},
        {"params": tp, "lr": tlr},
        {"params": list(net.head.parameters()), "lr": lr * 20},
        {"params": extra, "lr": tlr, "weight_decay": 0.0},
    ]
    opt = torch.optim.AdamW(groups, weight_decay=0.05)
    bases = [g["lr"] for g in opt.param_groups]
    g = torch.Generator(device=dev).manual_seed(seed)
    w = big.class_weight(tr["y"][tri])
    ytr = tr["y"].to(dev)
    xtr = tr["x"]
    steps_per = len(tri) // cbs
    total, step, start = epochs * steps_per, 0, time.time()
    best = (-1.0, 0, None, None)
    sizes = [net.size] + ([teacher.size] if teacher is not None else [])
    for ep in range(epochs):
        net.train()
        perm = tri[
            torch.randperm(len(tri), generator=torch.Generator().manual_seed(seed * 100 + ep))
        ]
        cperm = ctr[
            torch.randperm(len(ctr), generator=torch.Generator().manual_seed(seed * 1000 + ep))
        ]
        for k in range(steps_per):
            idx = perm[k * cbs : (k + 1) * cbs].to(dev)
            views = big.aug_views(xtr[idx], sizes, g)
            j = (k * sbs) % max(1, len(cperm) - sbs)
            cidx = cperm[j : j + sbs]
            cv = big.aug_views(cx[cidx.to(dev)], [net.size], g)[0]
            tb_ = [ctexts[i][(ep + i) % 2] for i in cidx.tolist()]
            for gr, base in zip(opt.param_groups, bases):
                gr["lr"] = base * 0.5 * (1 + math.cos(math.pi * step / total))
            with torch.autocast("cuda", dtype=torch.bfloat16):
                ls = net.cls(net.img(views[0]))
                loss_c = F.cross_entropy(ls, ytr[idx], weight=w)
                if teacher is not None:
                    with torch.no_grad():
                        lt = teacher(views[1]).float()
                    kdl = (
                        F.kl_div(
                            F.log_softmax(ls.float() / temp, 1),
                            F.softmax(lt / temp, 1),
                            reduction="batchmean",
                        )
                        * temp
                        * temp
                    )
                    loss_c = (1 - alpha) * loss_c + alpha * kdl
                fi = net.img(cv)
                ft = net.txt(tb_)
                logits = fi @ ft.T * net.clip.logit_scale.exp() + (
                    net.clip.logit_bias if hasattr(net.clip, "logit_bias") else 0
                )
                labels = 2 * torch.eye(len(tb_), device=dev) - 1
                loss_s = -F.logsigmoid(labels * logits).sum() / len(tb_)
                loss = loss_c + lam * loss_s
                if tkd > 0:
                    # 큰 모델의 사진-문장 유사도 분포를 따라 하기 (사진→문장, 문장→사진 양쪽)
                    ci = cidx.to(dev)
                    sel = torch.tensor([(ep + i) % 2 for i in cidx.tolist()], device=dev)
                    tt_ = t_txt[ci, sel]
                    st = (fi @ ft.T).float() / tkd_tau
                    te = (t_img[ci] @ tt_.T) / tkd_tau
                    loss_t = (
                        F.kl_div(F.log_softmax(st, 1), F.softmax(te, 1), reduction="batchmean")
                        + F.kl_div(
                            F.log_softmax(st.T, 1), F.softmax(te.T, 1), reduction="batchmean"
                        )
                    ) / 2
                    loss = loss + tkd * loss_t
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            step += 1
        net.eval()
        vacc = cls_eval(net, {"val": {"x": xtr[vai], "y": tr["y"][vai]}})["val"]
        vs = search_eval(
            net,
            cx[cva.to(dev)],
            [ctexts[i][0] for i in cva.tolist()],
            [ctexts[i][1] for i in cva.tolist()],
        )
        score = vacc + 0.5 * (vs["query"]["R@5"] + vs["caption"]["R@5"]) / 2
        log(
            tag,
            "ep",
            ep + 1,
            "val_acc",
            vacc,
            "val_search",
            vs,
            "score",
            round(score, 2),
            "loss",
            round(float(loss_c), 3),
            round(float(loss_s), 3),
            "sec",
            round(time.time() - start),
        )
        if score > best[0]:
            best = (
                score,
                ep + 1,
                {k: v.detach().clone() for k, v in net.state_dict().items()},
                {"val_acc": vacc, "val_search": vs},
            )
    train_sec = round(time.time() - start)
    net.load_state_dict(best[2])
    t2 = time.time()
    res = {
        "vb": vb,
        "tb": tb,
        "lam": lam,
        "kd": int(kd),
        "unl": unl,
        "tkd": tkd,
        "tkd_t": tkd_t if tkd > 0 else None,
        "epochs": epochs,
        "lr": lr,
        "tlr": tlr,
        "seed": seed,
        "best_epoch": best[1],
        "val": best[3],
        "before": before,
        "cls": cls_eval(net, sets),
        "search": search_eval(net, ex, eq, ec),
        "train_sec": train_sec,
    }
    res["time_sec"] = {
        "data": round(t_data),
        "search_teacher": round(t_tkd),
        "model_setup": round(t_setup - t_tkd),
        "eval_before": round(t_eval0),
        "train_incl_val": train_sec,
        "eval_final": round(time.time() - t2),
        "total": round(time.time() - t0),
    }
    sd = net.state_dict()
    torch.save(
        {
            # big.Net 모양(visual.*, head.*): big.run_qat의 init으로 그대로 쓴다
            "state": {
                k.replace("clip.visual.", "visual."): v.cpu()
                for k, v in sd.items()
                if k.startswith("clip.visual.") or k.startswith("head.")
            },
            "clip": {k[5:]: v.cpu() for k, v in sd.items() if k.startswith("clip.")},
            "head": {k[5:]: v.cpu() for k, v in sd.items() if k.startswith("head.")},
        },
        f"{OUT}/joint_{tag}.pt",
    )
    json.dump(res, open(f"{OUT}/joint_{tag}.json", "w"), indent=1, ensure_ascii=False)
    log("RESULT", tag, json.dumps(res, ensure_ascii=False))


if __name__ == "__main__":
    kw = dict(a.split("=", 1) for a in sys.argv[1:])
    if os.path.exists(f"{OUT}/joint_{kw.get('tag')}.json"):
        log("SKIP", kw.get("tag"))
        sys.exit(0)
    run(**kw)
