import type { SystemCardKind } from './chat-rules';
import type { MessageTarget } from './types';

/**
 * 시스템 카드 이동 버튼이 갈 화면(research R13, Clarifications 2026-11-05).
 * 투표(S22)·코스 화면이 아직 없어 비어 있고, 비어 있으면 버튼이 '준비 중이에요'를 띄운다.
 * 투표·코스 명세에서 이 표만 채운다. 예: poll: (target, tripId) => router.push(...)
 */
export const SYSTEM_CARD_ROUTES: Partial<
  Record<SystemCardKind, (target: MessageTarget, tripId: string) => void>
> = {};
