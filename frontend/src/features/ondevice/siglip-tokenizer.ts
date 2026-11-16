// SigLIP2(Gemma BPE) 토크나이저의 폰용 구현. 줄인 단어표(assets/ondev/tokenizer.json)를 쓴다.
// open_clip HFTokenizer와 같은 순서: canonicalize → 공백을 ▁로 → BPE(바이트 대체) → <eos> → 64칸 채움.
// ai 쪽 tok_dump.mjs로 파이썬 토크나이저와 같은 id가 나오는 것을 확인한 siglipTokenizer.js를 옮긴 것이다.

export type TokenizerSpec = {
  vocab: string[];
  merges: [string, string][];
  eos: number;
  pad: number;
  unk: number;
  contextLength: number;
};

const PUNCT = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'.split(''));
const SEP = '\u0000';

function canonicalize(text: string): string {
  const s = text.replace(/_/g, ' ');
  let out = '';
  for (const ch of s) if (!PUNCT.has(ch)) out += ch;
  out = out.toLowerCase();
  return out.split(/\s+/).filter(Boolean).join(' ').trim();
}

function utf8Bytes(ch: string): number[] {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp < 0x80) return [cp];
  if (cp < 0x800) return [0xc0 | (cp >> 6), 0x80 | (cp & 63)];
  if (cp < 0x10000) return [0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)];
  return [0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)];
}

export class SiglipTokenizer {
  private spec: TokenizerSpec;
  private ids: Map<string, number>;
  private ranks: Map<string, number>;

  constructor(spec: TokenizerSpec) {
    this.spec = spec;
    this.ids = new Map(spec.vocab.map((t, i) => [t, i]));
    this.ranks = new Map(spec.merges.map(([a, b], i) => [a + SEP + b, i]));
  }

  private bpe(text: string): number[] {
    // 한 덩어리(공백으로 나누지 않음)를 글자 단위로 시작한다. 단어표에 없는 글자는 UTF-8 바이트 토큰
    const syms: string[] = [];
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

  encode(text: string): number[] {
    const clean = canonicalize(text).replace(/ /g, '▁');
    const ids = clean ? this.bpe(clean).slice(0, this.spec.contextLength - 1) : [];
    ids.push(this.spec.eos);
    while (ids.length < this.spec.contextLength) ids.push(this.spec.pad);
    return ids;
  }
}
