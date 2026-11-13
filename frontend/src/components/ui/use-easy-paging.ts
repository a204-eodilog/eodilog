import { useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/** 이만큼(px)만 밀고 놓아도 다음 장으로 넘어간다. 기본 넘김은 반 장 넘게 밀어야 해서 답답했다 */
export const EASY_SWIPE = 24;

type Scrollable = { scrollTo: (options: { x: number; animated?: boolean }) => void };

/**
 * 옆으로 넘기는 카드 줄을 조금만 밀어도 한 장씩 넘어가게 한다.
 * 손가락을 뗄 때 민 방향을 보고 앞장이나 뒷장으로 직접 옮긴다. 한 번에 한 장만 넘어간다.
 * 돌려준 값을 스크롤 부품에 그대로 펼쳐 넣는다: <ScrollView horizontal {...paging} />
 */
export function useEasyPaging<T extends Scrollable>({
  step,
  count,
  onPage,
}: {
  /** 한 장의 폭(카드 폭 + 사이 간격) */
  step: number;
  count: number;
  onPage?: (index: number) => void;
}) {
  const ref = useRef<T>(null);
  const start = useRef(0);
  return {
    ref,
    onScrollBeginDrag: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      start.current = e.nativeEvent.contentOffset.x;
    },
    onScrollEndDrag: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (step <= 0 || count <= 0) return;
      const from = Math.round(start.current / step);
      const next = nextPage(from, e.nativeEvent.contentOffset.x - start.current, count);
      onPage?.(next);
      ref.current?.scrollTo({ x: next * step, animated: true });
    },
  };
}

/** 민 거리로 갈 장을 정한다. 조금 밀면 제자리, 넉넉히 밀면 민 방향으로 한 장. 처음과 끝을 넘지 않는다 */
export function nextPage(from: number, dragged: number, count: number): number {
  'worklet';
  const moved = Math.abs(dragged) < EASY_SWIPE ? from : from + Math.sign(dragged);
  return Math.min(Math.max(moved, 0), count - 1);
}
