"""폰용 줄인 단어표를 만든다.

남기는 토큰: 특수(0~3), 바이트(<0x..>), canonicalize 뒤 나올 수 있는 글자(소문자·숫자·한글·▁)로만 된 토큰 중
  - 한글·숫자·▁로만 된 것 전부 (한국어 문장은 원본과 토큰이 완전히 같다)
  - 한 글자짜리 전부
  - 그 밖(영어 섞임)은 병합 순위 LATIN_RANK 안쪽
출력: ondev/out/tokenizer.json {vocab, merges, origIds, contextLength, eos, pad}
"""

import json
import re
import sys
from pathlib import Path

import open_clip

LATIN_RANK = int(sys.argv[1]) if len(sys.argv) > 1 else 100_000
OUT = Path(__file__).parent / "out"
OUT.mkdir(exist_ok=True)

t = open_clip.get_tokenizer("ViT-B-32-SigLIP2-256")
j = json.loads(t.tokenizer.backend_tokenizer.to_str())
V = j["model"]["vocab"]
M = j["model"]["merges"]
rank = {}
for i, (a, b) in enumerate(M):
    rank.setdefault(a + b, i)

allowed = re.compile(r"^[a-z0-9ㄱ-ㆎ가-힣▁]+$")
korean_like = re.compile(r"^[0-9ㄱ-ㆎ가-힣▁]+$")
byte = re.compile(r"^<0x[0-9A-F]{2}>$")
keep = set()
for k, i in V.items():
    if i <= 3 or byte.match(k):
        keep.add(k)
    elif allowed.match(k) and (
        korean_like.match(k) or len(k) == 1 or rank.get(k, 10**9) < LATIN_RANK
    ):
        keep.add(k)

merges = []
broken = 0
for a, b in M:
    if a + b in keep:
        if a in keep and b in keep:
            merges.append([a, b])
        else:
            broken += 1
# 부모가 빠져 만들 수 없는 토큰은 버린다
reach = {k for k in keep if len(k) == 1 or byte.match(k) or V[k] <= 3} | {a + b for a, b in merges}
keep &= reach
ordered = sorted(keep, key=lambda k: V[k])
added = [a["content"] for a in j["added_tokens"] if allowed.match(a["content"])]
print(
    "keep",
    len(ordered),
    "merges",
    len(merges),
    "broken",
    broken,
    "added tokens that could match",
    added[:10],
)
json.dump(
    {
        "vocab": ordered,
        "merges": merges,
        "origIds": [V[k] for k in ordered],
        "contextLength": 64,
        "eos": ordered.index("<eos>"),
        "pad": ordered.index("<pad>"),
        "unk": ordered.index("<unk>"),
        "latinRank": LATIN_RANK,
    },
    open(OUT / "tokenizer.json", "w", encoding="utf-8"),
    ensure_ascii=False,
)
print("bytes", (OUT / "tokenizer.json").stat().st_size)
