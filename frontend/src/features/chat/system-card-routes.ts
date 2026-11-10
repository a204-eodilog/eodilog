import { router } from 'expo-router';

import type { SystemCardKind } from './chat-rules';
import type { MessageTarget } from './types';

/**
 * 시스템 카드 이동 버튼이 갈 화면(research R13, Clarifications 2026-11-05).
 * 투표(S22)는 투표 명세에서 연결했다. 코스 화면은 아직 없어 비어 있고, 비어 있으면 버튼이 '준비 중이에요'를 띄운다.
 * 코스 명세에서 이 표에 course만 채운다
 */
export const SYSTEM_CARD_ROUTES: Partial<
  Record<SystemCardKind, (target: MessageTarget, tripId: string) => void>
> = {
  // 투표 카드(투표 명세 FR-002). 대상이 투표면 그 투표, 아니면 그 여행의 대표 투표
  poll: (target, tripId) =>
    router.push(
      target.type === 'POLL' ? `/trips/${tripId}/polls/${target.id}` : `/trips/${tripId}/polls`,
    ),
};
