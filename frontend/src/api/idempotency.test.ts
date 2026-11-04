import { describe, expect, it } from '@jest/globals';
import { createIdempotencyKeyStore } from './idempotency';

function counterKeys() {
  let n = 0;
  return () => `key-${++n}`;
}

describe('createIdempotencyKeyStore', () => {
  it('같은 입력으로 다시 보내면 같은 키를 쓴다', () => {
    const store = createIdempotencyKeyStore(counterKeys());
    const body = { title: '겨울 여행' };

    expect(store.keyFor(body)).toBe('key-1');
    expect(store.keyFor({ title: '겨울 여행' })).toBe('key-1');
  });

  it('입력이 바뀌면 새 키를 만든다', () => {
    const store = createIdempotencyKeyStore(counterKeys());

    store.keyFor({ title: '겨울 여행' });
    expect(store.keyFor({ title: '봄 여행' })).toBe('key-2');
  });

  it('성공해서 clear한 뒤에는 같은 입력이어도 새 키다', () => {
    const store = createIdempotencyKeyStore(counterKeys());

    store.keyFor({ title: '겨울 여행' });
    store.clear();
    expect(store.keyFor({ title: '겨울 여행' })).toBe('key-2');
  });
});
