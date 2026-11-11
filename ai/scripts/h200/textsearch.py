"""포트폴리오: 한국어 문장으로 여행 사진 찾기 (SigLIP2 문장-사진 검색).

평가: 평가 사진 1,931장 + GMS 캡션(짧은 검색어 query, 묘사 문장 caption). 문장 → 사진 검색에서 정답 사진의 순위.
학습: 학습 사진 6,500장 + GMS 캡션으로 SigLIP 시그모이드 대조 학습 (사진·문장 인코더 뒤쪽 블록).

  textsearch.py eval model=<open_clip 이름> [ckpt=<tag>] tag=
  textsearch.py train model= blocks=4 tblocks=4 epochs=5 lr=1e-5 tag=
결과: ~/photo-train/results/big/ts_<tag>.json
"""

import json
import math
import os
import sys
import tarfile

import big
import numpy as np
import open_clip
import torch
import torch.nn.functional as F
from big import CACHE, OUT, dev, log
from PIL import Image

CAP_EVAL = OUT + "/cap_eval.json"  # {file: {query, caption}}
CAP_TRAIN = OUT + "/cap_train.json"  # {tar 안 이름: {query, caption}}


def load(model_name, ckpt=None):
    model, _, pre = open_clip.create_model_and_transforms(model_name, pretrained="webli")
    tok = open_clip.get_tokenizer(model_name)
    if ckpt == "service":  # 사진 분류용으로 파인튜닝한 사진 인코더 (문장 인코더는 그대로)
        model.visual.load_state_dict(torch.load(big.SERVICE_PT, map_location="cpu")["visual"])
    elif ckpt:
        model.load_state_dict(
            torch.load(f"{OUT}/ts_{ckpt}.pt", map_location="cpu")["state"], strict=False
        )
    size = pre.transforms[0].size[0]
    mean, std = pre.transforms[-1].mean, pre.transforms[-1].std
    return model.to(dev).eval(), tok, size, mean, std


@torch.no_grad()
def img_emb(model, xu8, size, mean, std, bs=128):
    out = []
    for i in range(0, len(xu8), bs):
        x = big.norm_px(big.eval_view(xu8[i : i + bs].to(dev), size), mean, std)
        with torch.autocast("cuda", dtype=torch.bfloat16):
            f = model.encode_image(x)
        out.append(F.normalize(f.float(), dim=-1))
    return torch.cat(out)


@torch.no_grad()
def txt_emb(model, tok, texts, bs=256):
    out = []
    for i in range(0, len(texts), bs):
        with torch.autocast("cuda", dtype=torch.bfloat16):
            f = model.encode_text(tok(texts[i : i + bs]).to(dev))
        out.append(F.normalize(f.float(), dim=-1))
    return torch.cat(out)


def eval_data():
    d = big.cached("gold_eval")
    caps = json.load(open(CAP_EVAL, encoding="utf-8"))
    keep = [i for i, f in enumerate(d["files"]) if os.path.basename(f) in caps]
    files = [os.path.basename(d["files"][i]) for i in keep]
    return d["x"][keep], [caps[f]["query"] for f in files], [caps[f]["caption"] for f in files]


def ranks(ti, ii):
    sims = ti @ ii.T
    target = sims.diag().unsqueeze(1)
    return (sims > target).sum(1).cpu().numpy() + 1  # 1이 1등


def metrics(r):
    return {
        "R@1": round(float((r <= 1).mean()) * 100, 2),
        "R@5": round(float((r <= 5).mean()) * 100, 2),
        "R@10": round(float((r <= 10).mean()) * 100, 2),
        "MRR": round(float((1 / r).mean()), 4),
        "median_rank": int(np.median(r)),
    }


def evaluate(model, tok, size, mean, std):
    x, q, c = eval_data()
    ii = img_emb(model, x, size, mean, std)
    return {
        "n": len(q),
        "query": metrics(ranks(txt_emb(model, tok, q), ii)),
        "caption": metrics(ranks(txt_emb(model, tok, c), ii)),
    }


def job_eval(model, ckpt=None, tag=None):
    m, tok, size, mean, std = load(model, ckpt)
    res = {"model": model, "ckpt": ckpt, **evaluate(m, tok, size, mean, std)}
    json.dump(res, open(f"{OUT}/ts_{tag}.json", "w"), indent=1, ensure_ascii=False)
    log("RESULT", tag, json.dumps(res, ensure_ascii=False))


def train_data():
    caps = json.load(open(CAP_TRAIN, encoding="utf-8"))
    xs, texts = [], []
    with tarfile.open(OUT + "/cap_train.tar") as t:
        for m in t.getmembers():
            if m.name not in caps:
                continue
            im = Image.open(t.extractfile(m)).convert("RGB").resize((CACHE, CACHE), Image.BICUBIC)
            xs.append(torch.from_numpy(np.asarray(im).copy()))
            texts.append((caps[m.name]["query"], caps[m.name]["caption"]))
    return torch.stack(xs).to(dev), texts


def job_train(model, blocks=4, tblocks=4, epochs=5, lr=1e-5, bs=256, tag=None, seed=1):
    torch.manual_seed(int(seed))
    m, tok, size, mean, std = load(model)
    before = evaluate(m, tok, size, mean, std)
    x, texts = train_data()
    log("train pairs", len(texts))
    for p in m.parameters():
        p.requires_grad = False
    trunk = m.visual.trunk
    mods = list(trunk.blocks[-int(blocks) :]) + [trunk.norm, trunk.attn_pool]
    tt = m.text
    tblk = getattr(tt, "transformer", None)
    tlayers = (
        tblk.resblocks
        if tblk is not None and hasattr(tblk, "resblocks")
        else getattr(tt.trunk, "blocks", None)
        if hasattr(tt, "trunk")
        else None
    )
    if tlayers is not None:
        mods += list(tlayers[-int(tblocks) :])
    for name in ("ln_final", "text_projection", "pooler", "head"):
        if hasattr(tt, name) and isinstance(getattr(tt, name), torch.nn.Module):
            mods.append(getattr(tt, name))
    for mod in mods:
        for p in mod.parameters():
            p.requires_grad = True
    for name in ("logit_scale", "logit_bias"):
        if hasattr(m, name):
            getattr(m, name).requires_grad = True
    params = [p for p in m.parameters() if p.requires_grad]
    log("trainable M", round(sum(p.numel() for p in params) / 1e6, 1))
    opt = torch.optim.AdamW(params, lr=float(lr), weight_decay=0.05)
    g = torch.Generator(device=dev).manual_seed(int(seed))
    n, bs = len(texts), int(bs)
    steps = int(epochs) * (n // bs)
    step = 0
    best = (before["query"]["R@5"] + before["caption"]["R@5"], 0, None)
    best_r = before
    for ep in range(int(epochs)):
        m.train()
        perm = torch.randperm(n)
        for k in range(n // bs):
            idx = perm[k * bs : (k + 1) * bs]
            xb = x[idx.to(dev)]
            v = big.aug_views(xb, [size], g)[0]
            # 짧은 검색어와 묘사 문장을 번갈아 쓴다
            tb = [texts[i][(ep + int(i)) % 2] for i in idx.tolist()]
            for gr in opt.param_groups:
                gr["lr"] = float(lr) * 0.5 * (1 + math.cos(math.pi * step / steps))
            with torch.autocast("cuda", dtype=torch.bfloat16):
                fi = F.normalize(m.encode_image(big.norm_px(v, mean, std)).float(), dim=-1)
                ft = F.normalize(m.encode_text(tok(tb).to(dev)).float(), dim=-1)
                logits = fi @ ft.T * m.logit_scale.exp() + (
                    m.logit_bias if hasattr(m, "logit_bias") else 0
                )
                labels = 2 * torch.eye(len(tb), device=dev) - 1
                loss = -F.logsigmoid(labels * logits).sum() / len(tb)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            step += 1
        m.eval()
        r = evaluate(m, tok, size, mean, std)
        score = r["query"]["R@5"] + r["caption"]["R@5"]
        log(tag, "epoch", ep + 1, "loss", round(float(loss), 4), r)
        if score > best[0]:
            best = (score, ep + 1, None)
            torch.save(
                {"state": {k: v.detach().cpu() for k, v in m.state_dict().items()}},
                f"{OUT}/ts_{tag}.pt",
            )
            best_r = r
    res = {
        "model": model,
        "blocks": int(blocks),
        "tblocks": int(tblocks),
        "epochs": int(epochs),
        "lr": float(lr),
        "n_train": n,
        "before": before,
        "best_epoch": best[1],
        "after": best_r,
    }
    json.dump(res, open(f"{OUT}/ts_{tag}.json", "w"), indent=1, ensure_ascii=False)
    log("RESULT", tag, json.dumps(res, ensure_ascii=False))


if __name__ == "__main__":
    kind = sys.argv[1]
    kw = dict(a.split("=", 1) for a in sys.argv[2:])
    if kw.get("tag") and os.path.exists(f"{OUT}/ts_{kw['tag']}.json"):
        log("SKIP", kw["tag"])
        sys.exit(0)
    {"eval": job_eval, "train": job_train}[kind](**kw)
