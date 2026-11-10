/**
 * 내 선택 저장 요청 합치기(research R2).
 * 서버의 PUT ballot은 내 선택 전체 교체라 마지막 선택만 보내면 된다.
 * 요청은 한 번에 하나만 보내고, 그사이 누른 선택은 마지막 하나만 기억했다가 앞 요청이 끝나면 보낸다.
 * 그래서 연달아 눌러도 요청은 많아야 2번이고, 응답 순서가 뒤집혀 오래된 선택이 남는 일이 없다
 */
export type BallotQueue = {
  /** 화면에서 고른 선택. saved는 지금 서버에 저장된 선택이다 */
  submit(ids: readonly string[], saved: readonly string[]): void;
  /** 보내는 중이거나 보낼 선택이 남았는가 */
  busy(): boolean;
};

type Options = {
  /** 실제 저장. 서버에 남은 선택을 돌려준다 */
  send(ids: string[]): Promise<string[]>;
  /** 실패. wanted는 저장하려던 선택이다. 남은 선택은 버린다(사용자가 다시 시도한다) */
  onError(error: unknown, wanted: string[]): void;
};

export function sameSelection(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

export function createBallotQueue({ send, onError }: Options): BallotQueue {
  let inFlight = false;
  let next: string[] | null = null;
  let saved: string[] = [];

  const run = (ids: string[]) => {
    inFlight = true;
    send(ids).then(
      (result) => {
        saved = result;
        inFlight = false;
        const pending = next;
        next = null;
        if (pending && !sameSelection(pending, saved)) run(pending);
      },
      (error: unknown) => {
        inFlight = false;
        next = null;
        onError(error, ids);
      },
    );
  };

  return {
    submit(ids, savedNow) {
      if (inFlight) {
        next = [...ids];
        return;
      }
      saved = [...savedNow];
      if (sameSelection(ids, saved)) return;
      run([...ids]);
    },
    busy: () => inFlight || next !== null,
  };
}
