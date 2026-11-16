// SigLIP2(Gemma BPE) 토크나이저의 폰용 구현. 줄인 단어표(tokenizer.json)를 쓴다.
// open_clip HFTokenizer와 같은 순서: canonicalize → 공백을 ▁로 → BPE(바이트 대체) → <eos> → 64칸 채움.

const PUNCT = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'.split(''));
const SEP = '\u0000';

function canonicalize(text) {
  let s = text.replace(/_/g, ' ');
  let out = '';
  for (const ch of s) if (!PUNCT.has(ch)) out += ch;
  out = out.toLowerCase();
  return out.split(/\s+/).filter(Boolean).join(' ').trim();
}

function utf8Bytes(ch) {
  const out = [];
  const cp = ch.codePointAt(0);
  if (cp < 0x80) out.push(cp);
  else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
  else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  return out;
}

export class SiglipTokenizer {
  constructor(spec) {
    this.spec = spec;
    this.ids = new Map(spec.vocab.map((t, i) => [t, i]));
    this.ranks = new Map(spec.merges.map(([a, b], i) => [a + SEP + b, i]));
    this.contextLength = spec.contextLength;
  }

  bpe(text) {
    // 한 덩어리(공백으로 나누지 않음)를 글자 단위로 시작한다. 단어표에 없는 글자는 UTF-8 바이트 토큰.
    let syms = [];
    for (const ch of text) {
      if (this.ids.has(ch)) syms.push(ch);
      else {
        for (const b of utf8Bytes(ch)) {
          const t = '<0x' + b.toString(16).toUpperCase().padStart(2, '0') + '>';
          syms.push(this.ids.has(t) ? t : '<unk>');
        }
      }
    }
    for (;;) {
      let best = Infinity;
      let at = -1;
      for (let i = 0; i + 1 < syms.length; i++) {
        const r = this.ranks.get(syms[i] + SEP + syms[i + 1]);
        if (r !== undefined && r < best) {
          best = r;
          at = i;
        }
      }
      if (at < 0) break;
      syms.splice(at, 2, syms[at] + syms[at + 1]);
    }
    return syms.map((s) => this.ids.get(s) ?? this.spec.unk);
  }

  encode(text) {
    const clean = canonicalize(text).replace(/ /g, '▁');
    const ids = clean ? this.bpe(clean).slice(0, this.contextLength - 1) : [];
    ids.push(this.spec.eos);
    while (ids.length < this.contextLength) ids.push(this.spec.pad);
    return ids;
  }
}
