// 폰용 JS 토크나이저로 문장 목록을 id로 바꾼다. 사용: node tok_dump_any.mjs <tokenizer.json> <texts.json> <out.json>
import fs from 'node:fs';
import { SiglipTokenizer } from './siglipTokenizer.mjs';

const [spec, tin, tout] = process.argv.slice(2);
const tok = new SiglipTokenizer(JSON.parse(fs.readFileSync(spec, 'utf8')));
const texts = JSON.parse(fs.readFileSync(tin, 'utf8'));
fs.writeFileSync(tout, JSON.stringify(texts.map((t) => tok.encode(t))));
