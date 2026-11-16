"""임베딩 증류용 라벨 없는 사진 묶음(cache_distill.pt)을 만든다. 라벨은 필요 없다(선생 벡터를 따라 하므로).

평가 누수 방지:
  - 71780 검증 압축(VS_photo.zip)은 통째로 뺀다(평가 1,931장이 여기 val에서 나왔다).
  - 평가·legacy·캡션 평가 파일 이름과 같은 것도 뺀다.
사진은 big.Decode와 같게 400×400 bicubic(비율 무시)으로 줄여 uint8로 저장한다.
CPU는 가볍게: 작업 프로세스 2개.
  prep_distill.py indoor=25000 person=25000 seed=0
"""

import glob
import io
import json
import os
import random
import sys
import zipfile
from multiprocessing import Pool

import numpy as np
import torch
from PIL import Image

H = os.path.expanduser("~/photo-train")
OUT = H + "/results/big"
CACHE = 400
IMG = (".jpg", ".jpeg", ".png")


def members(z):
    return [i.filename for i in zipfile.ZipFile(z).infolist() if i.filename.lower().endswith(IMG)]


def decode(job):
    z, names = job
    out, kept = [], []
    with zipfile.ZipFile(z) as f:
        for n in names:
            try:
                im = Image.open(io.BytesIO(f.read(n)))
                im.draft("RGB", (CACHE * 2, CACHE * 2))
                im = im.convert("RGB").resize((CACHE, CACHE), Image.BICUBIC)
                out.append(np.asarray(im).copy())
                kept.append(os.path.basename(n))
            except Exception:
                pass
    return np.stack(out) if out else np.zeros((0, CACHE, CACHE, 3), np.uint8), kept


def main(indoor=25000, person=25000, seed=0):
    indoor, person, seed = int(indoor), int(person), int(seed)
    rnd = random.Random(seed)
    ban = set()
    for name in ("gold_eval", "gold_legacy"):
        d = torch.load(f"{OUT}/cache_{name}.pt", map_location="cpu", mmap=True)
        ban |= {os.path.basename(f) for f in d["files"]}
    ban |= set(json.load(open(f"{OUT}/cap_eval.json", encoding="utf-8")))
    zips = sorted(glob.glob(H + "/aihub-*/**/*.zip", recursive=True))
    jobs, plan = [], {}
    for z in zips:
        if os.path.basename(z) == "VS_photo.zip":
            continue  # 평가 사진이 나온 71780 검증 묶음
        names = [n for n in members(z) if os.path.basename(n) not in ban]
        if not names:
            continue
        base = os.path.basename(z)
        cap = indoor if base == "indoor.zip" else person if base == "person.zip" else None
        if cap is not None and len(names) > cap:
            names = rnd.sample(names, cap)
        plan[z[len(H) + 1 :]] = len(names)
        jobs += [(z, names[i : i + 500]) for i in range(0, len(names), 500)]
    print("plan", json.dumps(plan, ensure_ascii=False), "total", sum(plan.values()), flush=True)
    xs, files = [], []
    with Pool(2) as p:
        for k, (x, kept) in enumerate(p.imap_unordered(decode, jobs)):
            xs.append(torch.from_numpy(x))
            files += kept
            if k % 20 == 0:
                print("chunk", k + 1, "/", len(jobs), "images", len(files), flush=True)
    d = {"x": torch.cat(xs), "files": files, "plan": plan}
    torch.save(d, f"{OUT}/cache_distill.pt")
    print("saved", tuple(d["x"].shape), flush=True)


if __name__ == "__main__":
    main(**dict(a.split("=", 1) for a in sys.argv[1:]))
