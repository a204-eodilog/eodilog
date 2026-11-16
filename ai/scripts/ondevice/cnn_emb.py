"""CNN 사진 인코더를 최종 공동 모델(B-32, joint_<teacher>)의 사진 벡터 공간에 맞춘다(임베딩 증류).

문장 인코더와 분류 헤드는 최종 모델 것을 그대로 쓴다. 폰에서는 사진 모델만 CNN으로 바꾸면 분류 + 문장 검색이 다 된다.
  손실 = (1 - cos(학생, 선생))
       + beta  * 문장 유사도 KD(캡션 배치: 학생 사진-문장 유사도 분포가 선생 것을 따라 하게)
       + gamma * 분류(라벨 있는 사진 CE + 모든 사진에서 선생 주제 확률 KD)
사진: 분류 학습셋(검증 15% 제외) + 캡션 학습셋(검증 10% 제외) + unl=1이면 라벨 없는 사진. 증류는 라벨이 필요 없다.
에폭은 학습 쪽에서 떼어 둔 검증으로 고른다. 평가 세트(eval1931, legacy, cap_eval)는 고르는 데 쓰지 않는다.
CNN 사전학습 가중치는 서버 HF 캐시에 이미 있는 것만 쓴다(HF_HUB_OFFLINE=1). 새로 받지 않는다.

  cnn_emb.py arch=efficientnet_b0.ra_in1k epochs=30 lr=1e-3 bs=256 sbs=256 beta=1 gamma=0.5 unl=1 seed=1 tag=
결과: ~/photo-train/results/big/cnnemb_<tag>.{json,pt}
"""

import json
import math
import os
import random
import sys
import time

os.environ.setdefault("HF_HUB_OFFLINE", "1")

import timm  # noqa: E402
import torch  # noqa: E402
import torch.nn.functional as F  # noqa: E402
from torch import nn  # noqa: E402

sys.path.insert(0, os.path.expanduser("~/photo-train"))
sys.path.insert(0, os.path.expanduser("~/photo-train/ondev"))
import big  # noqa: E402
from big import OUT, dev, log  # noqa: E402
from joint import Joint, cap_eval, cap_train, rmetrics  # noqa: E402

TEACHER = "v8t8l0.5k1tkd3s4"
SIZE = 256


class Student(nn.Module):
    """timm CNN 몸통 + 768 투영. 입력은 B-32와 같은 (x-0.5)/0.5 정규화라 폰 전처리를 바꿀 필요가 없다."""

    def __init__(self, arch):
        super().__init__()
        self.body = timm.create_model(arch, pretrained=True, num_classes=0)
        # MobileNetV4처럼 pool 뒤에 conv_head가 있으면 num_features와 실제 출력 크기가 달라서 직접 잰다
        with torch.no_grad():
            dim = self.body.eval()(torch.zeros(1, 3, SIZE, SIZE)).shape[1]
        self.proj = nn.Linear(dim, 768)

    def forward(self, x01):
        return F.normalize(self.proj(self.body((x01 - 0.5) / 0.5)).float(), dim=-1)


def load_teacher():
    net = Joint()
    st = torch.load(f"{OUT}/joint_{TEACHER}.pt", map_location="cpu")
    net.clip.load_state_dict(st["clip"])
    net.head.load_state_dict(st["head"])
    net = net.to(dev).eval()
    for p in net.parameters():
        p.requires_grad = False
    return net


@torch.no_grad()
def embed(fn, xu8, bs=256):
    out = []
    for i in range(0, len(xu8), bs):
        with torch.autocast("cuda", dtype=torch.bfloat16):
            out.append(fn(big.eval_view(xu8[i : i + bs].to(dev), SIZE)).float())
    return torch.cat(out)


def ranks(ti, ii):
    sims = ti @ ii.T
    return (sims > sims.diag().unsqueeze(1)).sum(1).cpu().numpy() + 1


def evaluate(student, teacher, sets, ex, tq, tc):
    """분류(선생 헤드) + 문장 검색(선생 문장 벡터) + 선생 벡터와의 평균 cos."""
    student.eval()
    res = {"cls": {}, "cos": {}}
    for name, d in sets.items():
        s = embed(student, d["x"])
        t = embed(teacher.img, d["x"])
        pred = teacher.cls(s).argmax(1).cpu()
        res["cls"][name] = round(float((pred == d["y"].cpu()).float().mean()) * 100, 2)
        res["cls"][name + "_n"] = int((pred == d["y"].cpu()).sum())
        res["cos"][name] = round(float((s * t).sum(1).mean()), 4)
    ii = embed(student, ex)
    res["search"] = {"query": rmetrics(ranks(tq, ii)), "caption": rmetrics(ranks(tc, ii))}
    return res


def run(
    arch="efficientnet_b0.ra_in1k",
    epochs=30,
    lr=1e-3,
    bs=256,
    sbs=256,
    beta=1.0,
    gamma=0.5,
    unl=1,
    tau=0.05,
    temp=2.0,
    seed=1,
    dist=0,
    tag="",
):
    epochs, bs, sbs, unl, seed, dist = (
        int(epochs),
        int(bs),
        int(sbs),
        int(unl),
        int(seed),
        int(dist),
    )
    # dist=1: 증류용 라벨 없는 사진(cache_distill.pt, 약 8.7만 장)을 더한다. 묶음은 GPU가 아니라 서버 RAM에 두고 배치만 GPU로 보낸다
    pool_dev = "cpu" if dist else dev
    lr, beta, gamma, tau, temp = float(lr), float(beta), float(gamma), float(tau), float(temp)
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

    # 사진 묶음: 라벨 있는 분류 사진(y>=0) + 캡션 사진(y=-1) + 라벨 없는 사진(y=-1)
    xs = [tr["x"][tri.to(tr["x"].device)].to(pool_dev), cx[ctr.to(dev)].to(pool_dev)]
    ys = [tr["y"][tri].to(dev), torch.full((len(ctr),), -1, device=dev)]
    if unl:
        u = torch.load(f"{OUT}/cache_unl.pt")
        xs.append(u["x"].to(pool_dev))
        ys.append(torch.full((len(u["x"]),), -1, device=dev))
        del u
    if dist:
        u = torch.load(f"{OUT}/cache_distill.pt")
        xs.append(u["x"])
        ys.append(torch.full((len(u["x"]),), -1, device=dev))
        del u
    px, py = torch.cat(xs), torch.cat(ys)
    del xs
    log(tag, "pool", len(px), "labeled", int((py >= 0).sum()))

    teacher = load_teacher()
    # 문장 인코더는 고정이라 캡션 문장 벡터를 한 번만 뽑는다
    with torch.no_grad():
        ttxt = torch.stack(
            [
                embed_text(teacher, [t[0] for t in ctexts]),
                embed_text(teacher, [t[1] for t in ctexts]),
            ],
            1,
        )
        tq, tc = embed_text(teacher, eq), embed_text(teacher, ec)
        vq = ttxt[cva, 0]
        vc = ttxt[cva, 1]
    t_data = time.time() - t0

    student = Student(arch).to(dev)
    params_m = round(sum(p.numel() for p in student.parameters()) / 1e6, 2)
    opt = torch.optim.AdamW(student.parameters(), lr=lr, weight_decay=0.05)
    w = big.class_weight(tr["y"][tri])
    g = torch.Generator(device=dev).manual_seed(seed)
    steps_per = len(px) // bs
    total, step, start = epochs * steps_per, 0, time.time()
    warm = min(500, total // 20)
    best = (-1.0, 0, None, None)
    for ep in range(epochs):
        student.train()
        perm = torch.randperm(len(px), generator=torch.Generator().manual_seed(seed * 100 + ep)).to(
            dev
        )
        cperm = ctr[
            torch.randperm(len(ctr), generator=torch.Generator().manual_seed(seed * 1000 + ep))
        ]
        for k in range(steps_per):
            idx = perm[k * bs : (k + 1) * bs]
            xb = px[idx.cpu()].to(dev, non_blocking=True) if dist else px[idx]
            v = big.aug_views(xb, [SIZE], g)[0]
            j = (k * sbs) % max(1, len(cperm) - sbs)
            cidx = cperm[j : j + sbs]
            cv = big.aug_views(cx[cidx.to(dev)], [SIZE], g)[0]
            sel = torch.tensor([(ep + i) % 2 for i in cidx.tolist()], device=dev)
            tt = ttxt[cidx.to(dev), sel]
            f = lr * (
                step / warm
                if step < warm
                else 0.5 * (1 + math.cos(math.pi * (step - warm) / max(1, total - warm)))
            )
            for gr in opt.param_groups:
                gr["lr"] = f
            with torch.no_grad(), torch.autocast("cuda", dtype=torch.bfloat16):
                te = teacher.img(v).float()
                tce = teacher.img(cv).float()
            with torch.autocast("cuda", dtype=torch.bfloat16):
                se = student(v)
                sce = student(cv)
            loss_e = (1 - (se * te).sum(1)).mean() + (1 - (sce * tce).sum(1)).mean()
            ss = (sce @ tt.T) / tau
            ts = (tce @ tt.T) / tau
            loss_t = (
                F.kl_div(F.log_softmax(ss, 1), F.softmax(ts, 1), reduction="batchmean")
                + F.kl_div(F.log_softmax(ss.T, 1), F.softmax(ts.T, 1), reduction="batchmean")
            ) / 2
            ls, lt = teacher.cls(se), teacher.cls(te)
            lab = py[idx] >= 0
            loss_c = (
                F.kl_div(
                    F.log_softmax(ls / temp, 1), F.softmax(lt / temp, 1), reduction="batchmean"
                )
                * temp
                * temp
            )
            if lab.any():
                loss_c = loss_c + F.cross_entropy(ls[lab], py[idx][lab], weight=w)
            loss = loss_e + beta * loss_t + gamma * loss_c
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            step += 1
        # 검증: 분류 검증 15% + 캡션 검증 10%
        student.eval()
        vs = embed(student, tr["x"][vai.to(tr["x"].device)])
        vacc = round(
            float((teacher.cls(vs).argmax(1).cpu() == tr["y"][vai].cpu()).float().mean()) * 100, 2
        )
        vi = embed(student, cx[cva.to(dev)])
        vsearch = {"query": rmetrics(ranks(vq, vi)), "caption": rmetrics(ranks(vc, vi))}
        score = vacc + 0.5 * (vsearch["query"]["R@5"] + vsearch["caption"]["R@5"]) / 2
        log(
            tag,
            "ep",
            ep + 1,
            "val_acc",
            vacc,
            "val_search",
            vsearch,
            "score",
            round(score, 2),
            "loss",
            round(float(loss_e), 4),
            round(float(loss_t), 4),
            round(float(loss_c), 4),
            "sec",
            round(time.time() - start),
        )
        if score > best[0]:
            best = (
                score,
                ep + 1,
                {k: v.detach().clone() for k, v in student.state_dict().items()},
                {"val_acc": vacc, "val_search": vsearch},
            )
    train_sec = round(time.time() - start)
    student.load_state_dict(best[2])
    res = {
        "arch": arch,
        "params_m": params_m,
        "epochs": epochs,
        "lr": lr,
        "bs": bs,
        "beta": beta,
        "gamma": gamma,
        "unl": unl,
        "tau": tau,
        "seed": seed,
        "dist": dist,
        "teacher": TEACHER,
        "pool": len(px),
        "best_epoch": best[1],
        "val": best[3],
        "test": evaluate(student, teacher, sets, ex, tq, tc),
        "teacher_test": {
            "search": {
                "query": rmetrics(ranks(tq, embed(teacher.img, ex))),
                "caption": rmetrics(ranks(tc, embed(teacher.img, ex))),
            }
        },
        "train_sec": train_sec,
        "data_sec": round(t_data),
        "total_sec": round(time.time() - t0),
    }
    torch.save(
        {"arch": arch, "state": {k: v.cpu() for k, v in student.state_dict().items()}},
        f"{OUT}/cnnemb_{tag}.pt",
    )
    json.dump(res, open(f"{OUT}/cnnemb_{tag}.json", "w"), indent=1, ensure_ascii=False)
    log("RESULT", tag, json.dumps(res, ensure_ascii=False))


@torch.no_grad()
def embed_text(teacher, texts, bs=256):
    out = []
    for i in range(0, len(texts), bs):
        with torch.autocast("cuda", dtype=torch.bfloat16):
            out.append(teacher.txt(texts[i : i + bs]).float())
    return torch.cat(out)


if __name__ == "__main__":
    kw = dict(a.split("=", 1) for a in sys.argv[1:])
    if os.path.exists(f"{OUT}/cnnemb_{kw.get('tag')}.json"):
        log("SKIP", kw.get("tag"))
        sys.exit(0)
    run(**kw)
