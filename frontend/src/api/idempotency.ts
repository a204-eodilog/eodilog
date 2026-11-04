import { randomUUID } from 'expo-crypto';

/**
 * 만드는 요청(POST /trips 등)의 Idempotency-Key를 동작 단위로 관리한다.
 *
 * 서버는 같은 키 + 같은 본문이면 처음 결과를 다시 주고, 같은 키 + 다른 본문이면 409를 준다.
 * 그래서 응답을 못 받고 다시 보낼 때는 같은 키를 써야 두 번 만들어지지 않는다.
 * 입력이 바뀌면 다른 동작이므로 새 키를 만든다. 성공하면 clear로 버린다.
 */
export function createIdempotencyKeyStore(makeKey: () => string = randomUUID) {
  let current: { input: string; key: string } | null = null;

  return {
    keyFor(input: unknown): string {
      const serialized = JSON.stringify(input);
      if (current?.input !== serialized) current = { input: serialized, key: makeKey() };
      return current.key;
    },
    clear() {
      current = null;
    },
  };
}

export type IdempotencyKeyStore = ReturnType<typeof createIdempotencyKeyStore>;
