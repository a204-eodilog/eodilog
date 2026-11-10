import type { ChecklistItem } from './types';

type Entry = {
  /** 서버가 마지막으로 돌려준 항목. version은 다음 요청의 expectedVersion이다 */
  server: ChecklistItem;
  inFlight: boolean;
  /** 보내는 중에 눌러 새로 원하게 된 상태. 없으면 null */
  wanted: boolean | null;
};

type Options = {
  send(item: ChecklistItem, checked: boolean): Promise<ChecklistItem>;
  /** 응답을 받았다. wanted가 null이 아니면 곧 다음 요청을 보낸다 */
  onSaved(item: ChecklistItem, wanted: boolean | null): void;
  /** 실패했다. server는 마지막으로 서버에 저장된 항목이다. 남은 요청은 버린다 */
  onError(server: ChecklistItem, error: unknown): void;
};

/**
 * 준비물 체크 저장 줄. 항목마다 요청을 하나만 보내고, 보내는 중에 다시 누르면 마지막 원하는 상태만 기억했다가
 * 응답의 version으로 이어 보낸다. 원하는 상태가 서버 상태와 같아지면 보내지 않는다.
 * 그래서 연타해도 expectedVersion이 어긋나 409가 나지 않고, 5번 눌러도 요청은 2번을 넘지 않는다.
 */
export function createCheckQueue({ send, onSaved, onError }: Options) {
  const entries = new Map<string, Entry>();

  function pump(id: string) {
    const entry = entries.get(id);
    if (!entry || entry.inFlight || entry.wanted === null) return;
    const target = entry.wanted;
    entry.wanted = null;
    if (target === entry.server.checked) return;
    entry.inFlight = true;
    send(entry.server, target).then(
      (saved) => {
        entry.server = saved;
        entry.inFlight = false;
        const next = entry.wanted !== null && entry.wanted !== saved.checked ? entry.wanted : null;
        if (next === null) entry.wanted = null;
        onSaved(saved, next);
        pump(id);
      },
      (error: unknown) => {
        entry.inFlight = false;
        entry.wanted = null;
        onError(entry.server, error);
      },
    );
  }

  return {
    /** 화면에 보이는 항목(서버 값 기준)을 원하는 체크 상태로 바꾼다 */
    toggle(item: ChecklistItem, checked: boolean) {
      const entry = entries.get(item.id);
      if (!entry) {
        entries.set(item.id, { server: item, inFlight: false, wanted: checked });
      } else {
        // 보내는 중이 아니면 캐시의 항목이 더 최신일 수 있다(목록을 다시 받음 등)
        if (!entry.inFlight && item.version >= entry.server.version) entry.server = item;
        entry.wanted = checked;
      }
      pump(item.id);
    },
    /** 보내는 중인지. 화면 테스트와 미리보기 확인용 */
    isSending(id: string) {
      return entries.get(id)?.inFlight ?? false;
    },
  };
}

export type CheckQueue = ReturnType<typeof createCheckQueue>;
